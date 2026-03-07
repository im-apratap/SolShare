import mongoose from "mongoose";
const expenseSchema = mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paidBy: {
      required: true,
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    splitAmong: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    splitType: {
      type: String,
      enum: ["equal", "percentage", "custom"],
    },
    shares: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        amount: Number,
      },
    ],
    currency: {
      type: String,
      default: "USD",
    },
  },
  { timestamps: true },
);
export const Expense = mongoose.model("Expense", expenseSchema);
