import { Router } from "express";
import {
  createSettlement,
  confirmSettlement,
  submitSignedTransaction,
  getGroupSettlements,
  getWalletBalance,
  getSolPrice,
  forceSettle,
} from "../controllers/settlement.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
const router = Router();
router.route("/sol-price").get(getSolPrice);

router.use(verifyJWT);
router.route("/create").post(createSettlement);
router.route("/confirm").post(confirmSettlement);
router.route("/submit").post(submitSignedTransaction);
router.route("/group/:groupId").get(getGroupSettlements);
router.route("/force-settle").post(forceSettle);
router.route("/balance").get(getWalletBalance);
export default router;
