import Razorpay from "razorpay";
import crypto from "node:crypto";
import prisma from "../utils/db";
import { Response, Request } from "express";
import {
  RAZORPAY_TEST_KEY_ID,
  RAZORPAY_TEST_SECRET_KEY,
} from "../utils/constants";

const rzp = new Razorpay({
  key_id: RAZORPAY_TEST_KEY_ID,
  key_secret: RAZORPAY_TEST_SECRET_KEY,
});

export async function initiate(req: Request, res: Response) {
  const { externalRef, sourceApp, amount, currency, email, contact, metadata } =
    req.body;

  try {
    const amountInPaise = amount * 100;
    const rOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: currency,
      receipt: externalRef,
      notes: {
        sourceApp,
        externalRef,
        ...metadata,
      },
      payment_capture: true,
    });

    await prisma.payment.create({
      data: {
        externalRef,
        sourceApp,
        amountPaise: amountInPaise,
        currency,
        email,
        contact,
        metadata,
        razorpayOrderId: rOrder.id,
        status: "created",
      },
    });

    const payload = {
      orderId: rOrder.id,
      keyId: RAZORPAY_TEST_KEY_ID,
      amount: amountInPaise,
      currency: currency,
    };

    if ((res as any).saveIdempotent) {
      await (res as any).saveIdempotent(payload);
    }
    console.log("Payment initiated successfully:", rOrder);
    return res.status(201).json(payload);
  } catch (error) {
    console.error("Error initiating payment:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

export async function confirm(req: Request, res: Response) {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
    req.body;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_TEST_SECRET_KEY)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "invalid_signature" });
  }

  try {
    const paymentRow = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id },
    });

    if (!paymentRow) {
      return res.status(404).json({
        error: "payment_not_found",
      });
    }

    const rPayment = await rzp.payments.fetch(razorpay_payment_id);
    await prisma.payment.update({
      where: { id: paymentRow.id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        status: rPayment.status,
        method: rPayment.method,
        email: rPayment.email || paymentRow.email || null,
        contact:
          rPayment.contact?.toString() ||
          paymentRow.contact ||
          null ||
          "<unknown>",
      },
    });

    return res.status(200).json({
      rPayment,
      status: rPayment.status,
      externalRef: paymentRow.externalRef,
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}

export async function refund(req: Request, res: Response) {
  const { paymentRef, amount, reason } = req.body;

  try {
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          {
            id: typeof paymentRef === "number" ? BigInt(paymentRef) : undefined,
          },
          {
            externalRef:
              typeof paymentRef === "string" ? paymentRef : undefined,
          },
        ].filter(Boolean) as any,
      },
    });

    if (!payment?.razorpayPaymentId) {
      return res.status(404).json({ error: "payment_not_found_or_unpaid" });
    }

    const rRefund = await rzp.payments.refund(payment.razorpayPaymentId, {
      amount: amount ? amount * 100 : undefined,
      notes: reason ? { reason } : undefined,
    } as any);

    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        razorpayRefundId: rRefund.id,
        amountPaise: Number(rRefund.amount ?? 0),
        reason: reason || null,
        status: rRefund.status,
      },
    });

    if ((res as any).saveIdempotent) {
      await (res as any).saveIdempotent({
        refundId: rRefund.id,
        status: rRefund.status,
      });
    }

    return res.status(201).json({
      refundId: rRefund.id,
      status: rRefund.status,
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}
