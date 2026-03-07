import { Expense } from "../models/expense.model.js";
import { Group } from "../models/group.model.js";
import { Settlement } from "../models/settlement.model.js";
import { History } from "../models/history.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Expo } from "expo-server-sdk";
import { sendPushNotifications } from "../utils/notifications.js";
import { getCachedExchangeRates } from "../utils/solana.js";
export const addExpense = async (req, res, next) => {
  try {
    let {
      description,
      amount,
      groupId,
      splitType,
      splitAmong,
      shares,
      currency,
    } = req.body;
    if (!description || !amount || !groupId) {
      throw new ApiError(400, "Description, amount, and groupId are required");
    }
    const group = await Group.findById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (member) => member.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    const participants = splitAmong || group.members;
    if (splitType === "custom" && shares) {
      const totalShares = shares.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(totalShares - amount) > 0.01) {
        throw new ApiError(
          400,
          "Custom shares must add up to the total amount",
        );
      }
    }
    if (splitType === "percentage" && shares) {
      const totalPercentage = shares.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new ApiError(400, "Percentage shares must add up to 100");
      }
    }

    if (currency && currency.toUpperCase() === "INR") {
      const { rates } = await getCachedExchangeRates();
      const inrToUsdRate = rates.usd / rates.inr;
      amount = amount * inrToUsdRate;

      if (splitType === "custom" && shares) {
        shares = shares.map((s) => ({
          ...s,
          amount: s.amount * inrToUsdRate,
        }));
      }
    }

    const expense = await Expense.create({
      description,
      amount,
      paidBy: req.user._id,
      groupId,
      splitType: splitType || "equal",
      splitAmong: participants,
      shares: shares || [],
      currency: "USD",
    });
    const populatedExpense = await Expense.findById(expense._id)
      .populate("paidBy", "name username pubKey")
      .populate("splitAmong", "name username pubKey")
      .populate("shares.user", "name username pubKey");
    await History.create({
      user: req.user._id,
      actionType: "EXPENSE_ADDED",
      group: groupId,
      description: `You added expense "${description}" of ${amount} to "${group.name}"`,
    });
    const messages = [];
    const pushTitle = `New Expense in ${group.name}`;
    const pushBody = `${req.user.name} added "${description}" for $${amount}`;
    let usersToNotify = [];
    if (splitType === "equal") {
      usersToNotify = group.members.filter(
        (m) => m.toString() !== req.user._id.toString(),
      );
    } else if (splitType === "custom" || splitType === "percentage") {
      usersToNotify = shares
        .map((s) => s.user)
        .filter((id) => id.toString() !== req.user._id.toString());
    }
    if (usersToNotify.length > 0) {
      const users = await User.find({ _id: { $in: usersToNotify } });
      for (const user of users) {
        if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
          messages.push({
            to: user.expoPushToken,
            sound: "default",
            title: pushTitle,
            body: pushBody,
            data: {
              groupId: group._id.toString(),
              expenseId: expense._id.toString(),
            },
          });
        }
      }
      if (messages.length > 0) {
        sendPushNotifications(messages).catch((err) =>
          console.error("Notification Error:", err),
        );
      }
    }
    return res
      .status(201)
      .json(
        new ApiResponse(201, populatedExpense, "Expense added successfully"),
      );
  } catch (error) {
    next(error);
  }
};
export const getGroupExpenses = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (member) => member.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    const expenses = await Expense.find({ groupId })
      .populate("paidBy", "name username pubKey")
      .populate("splitAmong", "name username pubKey")
      .populate("shares.user", "name username pubKey")
      .sort({ createdAt: -1 });
    return res
      .status(200)
      .json(new ApiResponse(200, expenses, "Expenses fetched successfully"));
  } catch (error) {
    next(error);
  }
};
export const getGroupBalances = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate(
      "members",
      "name username pubKey",
    );
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    const expenses = await Expense.find({ groupId });
    const balances = {};
    group.members.forEach((member) => {
      balances[member._id.toString()] = 0;
    });
    for (const expense of expenses) {
      const payerId = expense.paidBy.toString();
      if (expense.splitType === "equal") {
        const perPerson = expense.amount / expense.splitAmong.length;
        balances[payerId] += expense.amount;
        expense.splitAmong.forEach((userId) => {
          balances[userId.toString()] -= perPerson;
        });
      } else if (expense.splitType === "custom" && expense.shares.length > 0) {
        balances[payerId] += expense.amount;
        expense.shares.forEach((share) => {
          balances[share.user.toString()] -= share.amount;
        });
      } else if (
        expense.splitType === "percentage" &&
        expense.shares.length > 0
      ) {
        balances[payerId] += expense.amount;
        expense.shares.forEach((share) => {
          balances[share.user.toString()] -=
            (share.amount / 100) * expense.amount;
        });
      }
    }
    const confirmedSettlements = await Settlement.find({
      groupId,
      status: "confirmed",
    });
    for (const settlement of confirmedSettlements) {
      const fromId = settlement.from.toString();
      const toId = settlement.to.toString();
      if (balances[fromId] !== undefined) balances[fromId] += settlement.amount;
      if (balances[toId] !== undefined) balances[toId] -= settlement.amount;
    }
    const settlements = calculateSettlements(balances);
    const memberMap = {};
    group.members.forEach((member) => {
      memberMap[member._id.toString()] = {
        _id: member._id,
        name: member.name,
        username: member.username,
        pubKey: member.pubKey,
      };
    });
    const balanceDetails = Object.entries(balances).map(([userId, amount]) => ({
      user: memberMap[userId],
      netBalance: Math.round(amount * 100) / 100,
    }));
    const settlementDetails = settlements.map((s) => ({
      from: memberMap[s.from],
      to: memberMap[s.to],
      amount: Math.round(s.amount * 100) / 100,
    }));
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          balances: balanceDetails,
          settlements: settlementDetails,
        },
        "Balances calculated successfully",
      ),
    );
  } catch (error) {
    next(error);
  }
};
function calculateSettlements(balances) {
  const settlements = [];
  const debtors = [];
  const creditors = [];
  Object.entries(balances).forEach(([userId, amount]) => {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ userId, amount: Math.abs(rounded) });
    } else if (rounded > 0.01) {
      creditors.push({ userId, amount: rounded });
    }
  });
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);
    if (settleAmount > 0.01) {
      settlements.push({
        from: debtors[i].userId,
        to: creditors[j].userId,
        amount: settleAmount,
      });
    }
    debtors[i].amount -= settleAmount;
    creditors[j].amount -= settleAmount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return settlements;
}
export const deleteExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new ApiError(404, "Expense not found");
    }
    const group = await Group.findById(expense.groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    await Expense.findByIdAndDelete(expenseId);
    await History.create({
      user: req.user._id,
      actionType: "EXPENSE_DELETED",
      group: group._id,
      description: `You deleted expense "${expense.description}" of ${expense.amount} from "${group.name}"`,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Expense deleted successfully"));
  } catch (error) {
    next(error);
  }
};
export const getExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const expense = await Expense.findById(expenseId)
      .populate("paidBy", "name username pubKey")
      .populate("splitAmong", "name username pubKey")
      .populate("shares.user", "name username pubKey");
    if (!expense) {
      throw new ApiError(404, "Expense not found");
    }
    const group = await Group.findById(expense.groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, expense, "Expense fetched successfully"));
  } catch (error) {
    next(error);
  }
};
export const updateExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const { description, amount, splitType, splitAmong, shares } = req.body;
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new ApiError(404, "Expense not found");
    }
    const group = await Group.findById(expense.groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    if (amount) {
      if (splitType === "custom" && shares) {
        const totalShares = shares.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(totalShares - amount) > 0.01) {
          throw new ApiError(
            400,
            "Custom shares must add up to the total amount",
          );
        }
      }
      if (splitType === "percentage" && shares) {
        const totalPercentage = shares.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          throw new ApiError(400, "Percentage shares must add up to 100");
        }
      }
    }
    const updateData = {};
    if (description) updateData.description = description;
    if (amount) updateData.amount = amount;
    if (splitType) updateData.splitType = splitType;
    if (splitAmong) updateData.splitAmong = splitAmong;
    if (shares) updateData.shares = shares;
    const updatedExpense = await Expense.findByIdAndUpdate(
      expenseId,
      updateData,
      { new: true },
    )
      .populate("paidBy", "name username pubKey")
      .populate("splitAmong", "name username pubKey")
      .populate("shares.user", "name username pubKey");
    await History.create({
      user: req.user._id,
      actionType: "EXPENSE_ADDED",
      group: group._id,
      description: `You edited expense "${updatedExpense.description}" (${updatedExpense.amount}) in "${group.name}"`,
    });
    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedExpense, "Expense updated successfully"),
      );
  } catch (error) {
    next(error);
  }
};
