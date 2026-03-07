import { Expense } from "../models/expense.model.js";
import { Group } from "../models/group.model.js";
import { Settlement } from "../models/settlement.model.js";
import { History } from "../models/history.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  buildTransferTransaction,
  buildBatchTransferTransaction,
  verifyTransaction,
  getBalance,
  connection,
  getExchangeRates,
  getCachedExchangeRates,
} from "../utils/solana.js";
import { Expo } from "expo-server-sdk";
import { sendPushNotifications } from "../utils/notifications.js";
const calculateNetBalances = async (groupId) => {
  const group = await Group.findById(groupId).populate(
    "members",
    "name username pubKey",
  );
  if (!group) throw new ApiError(404, "Group not found");
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
        amount: Math.round(settleAmount * 100) / 100,
      });
    }
    debtors[i].amount -= settleAmount;
    creditors[j].amount -= settleAmount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return { group, settlements };
};
export const createSettlement = async (req, res, next) => {
  try {
    const { groupId, toUserId, amount } = req.body;
    if (!groupId) {
      throw new ApiError(400, "groupId is required");
    }
    const { group, settlements } = await calculateNetBalances(groupId);
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }
    let userSettlements = settlements.filter(
      (s) => s.from === req.user._id.toString(),
    );
    if (toUserId && amount) {
      const matchingSettlement = userSettlements.find((s) => s.to === toUserId);
      if (!matchingSettlement) {
        throw new ApiError(
          400,
          "You do not owe this user anything according to the calculated balances.",
        );
      }
      if (amount > matchingSettlement.amount + 0.05) {
        throw new ApiError(
          400,
          `You only owe ${matchingSettlement.amount} SOL to this user.`,
        );
      }
      userSettlements = [
        {
          from: req.user._id.toString(),
          to: toUserId,
          amount: Number(amount),
        },
      ];
    }
    if (userSettlements.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { transactions: [] },
            "You don't owe anything in this group",
          ),
        );
    }
    const memberMap = {};
    group.members.forEach((member) => {
      memberMap[member._id.toString()] = member;
    });
    const userPubKey = memberMap[req.user._id.toString()]?.pubKey;
    if (!userPubKey) {
      throw new ApiError(400, "Your wallet public key is not set");
    }
    const exchangeRates = await getExchangeRates();
    const solPrice = exchangeRates.usd;
    const balance = await getBalance(userPubKey);
    const totalOweUSD = userSettlements.reduce((sum, s) => sum + s.amount, 0);
    const totalOweSOL = totalOweUSD / solPrice;
    if (balance < totalOweSOL) {
      throw new ApiError(
        400,
        `Insufficient balance. You have ${balance.toFixed(4)} SOL but owe ${totalOweSOL.toFixed(4)} SOL ($${totalOweUSD.toFixed(2)})`,
      );
    }
    const transfers = userSettlements.map((s) => {
      const amountInSOL = s.amount / solPrice;
      return {
        toPubkey: memberMap[s.to].pubKey,
        amountInSOL: Math.max(0.000000001, amountInSOL),
        toUser: memberMap[s.to],
      };
    });
    const memo = JSON.stringify({
      type: "settlement",
      groupId: group._id,
      groupName: group.name,
      note: "Settled via SolShare",
    });
    let transactionData;
    if (transfers.length === 1) {
      transactionData = await buildTransferTransaction(
        userPubKey,
        transfers[0].toPubkey,
        transfers[0].amountInSOL,
        memo,
      );
    } else {
      transactionData = await buildBatchTransferTransaction(
        userPubKey,
        transfers,
        memo,
      );
    }
    const settlementRecords = [];
    for (const s of userSettlements) {
      const amountInSOL = s.amount / solPrice;
      const record = await Settlement.create({
        groupId,
        from: req.user._id,
        to: s.to,
        amount: s.amount,
        amountInLamports: Math.round(amountInSOL * 1000000000),
        status: "pending",
      });
      settlementRecords.push(record);
    }
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          serializedTransaction: transactionData.transaction,
          blockhash: transactionData.blockhash,
          settlements: userSettlements.map((s, i) => ({
            settlementId: settlementRecords[i]._id,
            to: memberMap[s.to].username,
            toPubKey: memberMap[s.to].pubKey,
            amount: s.amount,
          })),
          totalAmount: totalOweSOL,
          totalAmountUSD: totalOweUSD,
        },
        "Settlement transaction created. Sign and submit from your wallet.",
      ),
    );
  } catch (error) {
    next(error);
  }
};
export const confirmSettlement = async (req, res, next) => {
  try {
    const { settlementIds, txSignature } = req.body;
    if (!settlementIds || !txSignature) {
      throw new ApiError(400, "settlementIds and txSignature are required");
    }
    const verification = await verifyTransaction(txSignature);
    if (!verification.confirmed) {
      await Settlement.updateMany(
        { _id: { $in: settlementIds } },
        { status: "failed", txSignature },
      );
      throw new ApiError(400, "Transaction not confirmed on Solana");
    }
    await Settlement.updateMany(
      { _id: { $in: settlementIds } },
      { status: "confirmed", txSignature },
    );
    const updatedSettlements = await Settlement.find({
      _id: { $in: settlementIds },
    })
      .populate("from", "name username pubKey")
      .populate("to", "name username pubKey")
      .populate("groupId", "name");
    for (const s of updatedSettlements) {
      await History.create({
        user: s.from._id,
        actionType: "SETTLEMENT_CONFIRMED",
        group: s.groupId ? s.groupId._id : null,
        description: `You settled ${s.amount} SOL with ${s.to.name}`,
        txSignature,
      });
      await History.create({
        user: s.to._id,
        actionType: "SETTLEMENT_CONFIRMED",
        group: s.groupId ? s.groupId._id : null,
        description: `${s.from.name} settled ${s.amount} SOL with you`,
        txSignature,
      });
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { settlements: updatedSettlements, txSignature },
          "Settlement confirmed on-chain",
        ),
      );
  } catch (error) {
    next(error);
  }
};
export const submitSignedTransaction = async (req, res, next) => {
  try {
    const { signedTransaction, settlementIds } = req.body;
    if (!signedTransaction || !settlementIds) {
      throw new ApiError(
        400,
        "signedTransaction and settlementIds are required",
      );
    }
    const txBuffer = Buffer.from(signedTransaction, "base64");
    const txSignature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      await Settlement.updateMany(
        { _id: { $in: settlementIds } },
        { status: "failed", txSignature },
      );
      throw new ApiError(400, "Transaction failed on-chain");
    }
    await Settlement.updateMany(
      { _id: { $in: settlementIds } },
      { status: "confirmed", txSignature },
    );
    const updatedSettlements = await Settlement.find({
      _id: { $in: settlementIds },
    })
      .populate("from", "name username pubKey")
      .populate("to", "name username pubKey")
      .populate("groupId", "name");
    for (const s of updatedSettlements) {
      await History.create({
        user: s.from._id,
        actionType: "SETTLEMENT_CONFIRMED",
        group: s.groupId ? s.groupId._id : null,
        description: `You settled ${s.amount} SOL with ${s.to.name}`,
        txSignature,
      });
      await History.create({
        user: s.to._id,
        actionType: "SETTLEMENT_CONFIRMED",
        group: s.groupId ? s.groupId._id : null,
        description: `${s.from.name} settled ${s.amount} SOL with you`,
        txSignature,
      });
    }
    const messages = [];
    for (const s of updatedSettlements) {
      const receiver = await User.findById(s.to._id);
      if (
        receiver &&
        receiver.expoPushToken &&
        Expo.isExpoPushToken(receiver.expoPushToken)
      ) {
        messages.push({
          to: receiver.expoPushToken,
          sound: "default",
          title: "Payment Received",
          body: `${s.from.name} just paid you ${s.amount} SOL! 💸`,
          data: { groupId: s.groupId ? s.groupId._id.toString() : null },
        });
      }
    }
    if (messages.length > 0) {
      sendPushNotifications(messages).catch(console.error);
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { settlements: updatedSettlements, txSignature },
          "Transaction submitted and confirmed on-chain!",
        ),
      );
  } catch (error) {
    next(error);
  }
};
export const getGroupSettlements = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const settlements = await Settlement.find({ groupId })
      .populate("from", "name username pubKey")
      .populate("to", "name username pubKey")
      .sort({ createdAt: -1 });
    return res
      .status(200)
      .json(
        new ApiResponse(200, settlements, "Settlements fetched successfully"),
      );
  } catch (error) {
    next(error);
  }
};
export const getWalletBalance = async (req, res, next) => {
  try {
    const pubKey = req.user.pubKey;
    if (!pubKey) {
      throw new ApiError(400, "Wallet public key not set");
    }
    const balance = await getBalance(pubKey);
    return res
      .status(200)
      .json(new ApiResponse(200, { balance, pubKey }, "Balance fetched"));
  } catch (error) {
    next(error);
  }
};
export const getSolPrice = async (req, res, next) => {
  try {
    const { rates, updatedAt } = await getCachedExchangeRates();
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { priceUSD: rates.usd, priceINR: rates.inr, updatedAt },
          "SOL prices fetched",
        ),
      );
  } catch (error) {
    next(error);
  }
};
