import { Router } from "express";
import {
  createSettlement,
  confirmSettlement,
  submitSignedTransaction,
  getGroupSettlements,
  getWalletBalance,
  getSolPrice,
} from "../controllers/settlement.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/create").post(createSettlement);
router.route("/confirm").post(confirmSettlement);
router.route("/submit").post(submitSignedTransaction);
router.route("/group/:groupId").get(getGroupSettlements);
router.route("/balance").get(getWalletBalance);
router.route("/sol-price").get(getSolPrice);

export default router;
