import * as subscriptions from "../controllers/subscriptions";
import { Router } from "express";
import validate from "../utils/validation";
import { withIdempotency } from "../utils/idempotency";

const router = Router();

// Route to list subscriptions
router.get("/subscriptions/list", subscriptions.listSubscriptions);

router.post(
  "/subscriptions/create",
  validate(subscriptions.createSubscriptionSchema as any),
  withIdempotency("subscriptions:create"),
  subscriptions.createSubscription
);

router.post(
  "/subscriptions/cancel",
  validate(subscriptions.cancelSubscriptionSchema as any),
  withIdempotency("subscriptions:cancel"),
  subscriptions.cancelSubscription
);

export default router;
