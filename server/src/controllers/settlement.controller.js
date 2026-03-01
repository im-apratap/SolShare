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
  getSolPriceInUSD,
  getCachedSolPriceInUSD,
} from "../utils/solana.js";
import { Expo } from "expo-server-sdk";
import { sendPushNotifications } from "../utils/notifications.js";

// Calculate net balances for a group (reused from expense controller logic).
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

  // Fetch all confirmed settlements for this group
  const confirmedSettlements = await Settlement.find({
    groupId,
    status: "confirmed",
  });

  // Apply settlements to balances
  for (const settlement of confirmedSettlements) {
    const fromId = settlement.from.toString();
    const toId = settlement.to.toString();
    // 'from' paid 'to', so 'from' balance increases (less debt), 'to' balance decreases (less credit)
    if (balances[fromId] !== undefined) balances[fromId] += settlement.amount;
    if (balances[toId] !== undefined) balances[toId] -= settlement.amount;
  }

  // Calculate minimum settlements using greedy algorithm
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

// Create settlement transactions for a group.
// Returns unsigned transactions for the debtor to sign on the mobile app.
export const createSettlement = async (req, res, next) => {
  try {
    const { groupId, toUserId, amount } = req.body;

    if (!groupId) {
      throw new ApiError(400, "groupId is required");
    }

    const { group, settlements } = await calculateNetBalances(groupId);

    // Check that the requesting user is a member
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }

    // Find settlements where the current user is the debtor
    let userSettlements = settlements.filter(
      (s) => s.from === req.user._id.toString(),
    );

    // If specific parameters are provided, override the greedy calculation
    if (toUserId && amount) {
      // Validate that this settlement makes sense (the user owes this person)
      const matchingSettlement = userSettlements.find((s) => s.to === toUserId);
      if (!matchingSettlement) {
        throw new ApiError(
          400,
          "You do not owe this user anything according to the calculated balances.",
        );
      }
      if (amount > matchingSettlement.amount + 0.05) {
        // Small floating point buffer
        throw new ApiError(
          400,
          `You only owe ${matchingSettlement.amount} SOL to this user.`,
        );
      }
      // Replace the batch with just this single specific transfer
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

    // Build member map for pubKey lookup
    const memberMap = {};
    group.members.forEach((member) => {
      memberMap[member._id.toString()] = member;
    });

    // Check that the user has a pubKey
    const userPubKey = memberMap[req.user._id.toString()]?.pubKey;
    if (!userPubKey) {
      throw new ApiError(400, "Your wallet public key is not set");
    }

    // Fetch SOL price to convert USD to SOL
    const solPrice = await getSolPriceInUSD();

    // Check wallet balance
    const balance = await getBalance(userPubKey);
    const totalOweUSD = userSettlements.reduce((sum, s) => sum + s.amount, 0);
    const totalOweSOL = totalOweUSD / solPrice;

    if (balance < totalOweSOL) {
      throw new ApiError(
        400,
        `Insufficient balance. You have ${balance.toFixed(4)} SOL but owe ${totalOweSOL.toFixed(4)} SOL ($${totalOweUSD.toFixed(2)})`,
      );
    }

    // Build transfer transactions
    const transfers = userSettlements.map((s) => {
      const amountInSOL = s.amount / solPrice;
      return {
        toPubkey: memberMap[s.to].pubKey,
        amountInSOL: Math.max(0.000000001, amountInSOL), // ensure non-zero
        toUser: memberMap[s.to],
      };
    });

    // Create on-chain memo
    const memo = JSON.stringify({
      type: "settlement",
      groupId: group._id,
      groupName: group.name,
      note: "Settled via SplitSol",
    });

    // Use batch transaction if multiple creditors
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

    // Save pending settlements in DB
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

// Confirm a settlement after the mobile app submits the signed transaction.
// The app sends the tx signature for verification.
export const confirmSettlement = async (req, res, next) => {
  try {
    const { settlementIds, txSignature } = req.body;

    if (!settlementIds || !txSignature) {
      throw new ApiError(400, "settlementIds and txSignature are required");
    }

    // Verify the transaction on Solana
    const verification = await verifyTransaction(txSignature);

    if (!verification.confirmed) {
      // Update settlements as failed
      await Settlement.updateMany(
        { _id: { $in: settlementIds } },
        { status: "failed", txSignature },
      );

      throw new ApiError(400, "Transaction not confirmed on Solana");
    }

    // Update settlements as confirmed
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

    // Log history for each confirmed settlement
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

// Submit a signed transaction from the mobile app.
// Broadcasts to Solana, then confirms the settlements.
export const submitSignedTransaction = async (req, res, next) => {
  try {
    const { signedTransaction, settlementIds } = req.body;

    if (!signedTransaction || !settlementIds) {
      throw new ApiError(
        400,
        "signedTransaction and settlementIds are required",
      );
    }

    // Deserialize and send the signed transaction
    const txBuffer = Buffer.from(signedTransaction, "base64");
    const txSignature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Wait for confirmation
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

    // Update settlements as confirmed
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

    // Log history for each confirmed settlement
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

    // Attempt to notify the receivers via Expo Push
    const messages = [];
    for (const s of updatedSettlements) {
      // Find the receiver's full user doc to get their token
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

// Get all settlements for a group.
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

// Get wallet balance for the current user.
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

// Get current SOL price in USD (cached).
export const getSolPrice = async (req, res, next) => {
  try {
    const { price, updatedAt } = await getCachedSolPriceInUSD();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { priceUSD: price, updatedAt },
          "SOL price fetched",
        ),
      );
  } catch (error) {
    next(error);
  }
};
