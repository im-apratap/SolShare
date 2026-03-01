import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ENV } from "./config/env.js";
import connectDB from "./config/db.js";
import { errorHandler } from "./middlewares/error.middleware.js";

import userRoutes from "./routes/user.routes.js";
import groupRoutes from "./routes/group.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import settlementRoutes from "./routes/settlement.routes.js";
import billRoutes from "./routes/bill.routes.js";
import friendRoutes from "./routes/friend.route.js";
import historyRoutes from "./routes/history.route.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SolShare is running, hurray..." });
});

app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/bill", billRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/history", historyRoutes);

// Global error handler (must be after routes)
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    if (ENV.NODE_ENV !== "production") {
      app.listen(ENV.PORT, () => {
        console.log(`Server running on PORT ${ENV.PORT}`);
      });
    }
  } catch (error) {
    console.log("Error while starting the Server: ", error);
    process.exit(1);
  }
};

startServer();
