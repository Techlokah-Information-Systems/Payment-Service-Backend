import { Router } from "express";
import z from "zod";
import validate from "../utils/validation";
import { withIdempotency } from "../utils/idempotency";

import * as payments from "../controllers/payments";
import * as webhooks from "../controllers/webhooks";

const router = Router();

const paymentInitiateSchema = z.object({
  externalRef: z.string().min(1),
  sourceApp: z.string().optional(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  email: z.email().optional(),
  contact: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const paymentConfirmSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

router.post(
  "/payments/initiate",
  validate(paymentInitiateSchema as any),
  withIdempotency("initiate_payment"),
  payments.initiate
);

router.post(
  "/payments/confirm",
  validate(paymentConfirmSchema as any),
  payments.confirm
);

router.post("/webhooks/razorpay", webhooks.handleWebhook);

export default router;
