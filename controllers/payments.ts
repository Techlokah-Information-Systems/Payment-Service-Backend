import Razorpay from "razorpay";
import crypto from "node:crypto";
import prisma from "../utils/db";
import { Response, Request } from "express";
import {
  RAZORPAY_TEST_KEY_ID,
  RAZORPAY_TEST_SECRET_KEY,
} from "../utils/constants";
import {
  mapRazorpayPaymentStatus,
  mapRazorpayRefundStatus,
} from "../utils/mappers";
import { PaymentStatus, RazorpayPaymentMethod } from "../generated/prisma";
import { catchAsyncError } from "../middlewares/catchAsyncError";

const rzp = new Razorpay({
  key_id: RAZORPAY_TEST_KEY_ID,
  key_secret: RAZORPAY_TEST_SECRET_KEY,
});

export const initiate = catchAsyncError(async (req: Request, res: Response) => {
  const { externalRef, sourceApp, amount, currency, email, contact, metadata } =
    req.body;

  try {
    const numAmount = Number(amount);
    if (!amount || Number.isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "invalid_amount" });
    }
    const amountInPaise = Math.round(numAmount * 100);
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
        amountPaise: BigInt(amountInPaise),
        currency,
        email: email || null,
        contact: contact || null,
        metadata: metadata || null,
        razorpayOrderId: rOrder.id,
        status: PaymentStatus.CREATED,
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

    return res.status(201).json(payload);
  } catch (error) {
    console.error("Error initiating payment:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

export const confirm = catchAsyncError(async (req: Request, res: Response) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
    req.body;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_TEST_SECRET_KEY)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (
    !razorpay_payment_id ||
    !razorpay_order_id ||
    !razorpay_signature ||
    !expectedSignature
  ) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  const generatedSignatureBuffer = Buffer.from(expectedSignature);
  const receivedSignatureBuffer = Buffer.from(razorpay_signature);

  const isAuthentic =
    generatedSignatureBuffer.length === receivedSignatureBuffer.length &&
    crypto.timingSafeEqual(generatedSignatureBuffer, receivedSignatureBuffer);

  if (!isAuthentic) {
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
        status: mapRazorpayPaymentStatus(rPayment.status),
        method: (rPayment.method as RazorpayPaymentMethod) || null,
        email: rPayment.email || paymentRow.email || null,
        contact:
          rPayment.contact?.toString() ||
          paymentRow.contact ||
          null ||
          "<unknown>",
      },
    });

    return res
      .status(200)
      .json({ status: rPayment.status, externalRef: paymentRow.externalRef });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

export const refund = catchAsyncError(async (req: Request, res: Response) => {
  const { paymentRef, amount, reason } = req.body;

  try {
    let paymentIdSearch: bigint | undefined;
    if (
      typeof paymentRef === "number" ||
      (typeof paymentRef === "string" && /^\d+$/.test(paymentRef))
    ) {
      paymentIdSearch = BigInt(paymentRef);
    }

    const whereConditions: any[] = [];
    if (paymentIdSearch) {
      whereConditions.push({ id: paymentIdSearch });
    }
    if (typeof paymentRef === "string") {
      whereConditions.push({ externalRef: paymentRef });
    }

    if (whereConditions.length === 0) {
      return res.status(400).json({ error: "invalid_payment_reference" });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: whereConditions,
      },
    });

    if (!payment || !payment.razorpayPaymentId) {
      return res.status(404).json({ error: "payment_not_found_or_unpaid" });
    }

    const refundPayload: any = {
      notes: reason ? { reason } : undefined,
    };
    if (amount !== undefined && amount !== null) {
      refundPayload.amount = Math.round(Number(amount) * 100);
    }

    const rRefund = await rzp.payments.refund(
      payment.razorpayPaymentId,
      refundPayload,
    );

    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        razorpayRefundId: rRefund.id,
        amountPaise: BigInt(rRefund.amount ?? 0),
        reason: reason || null,
        status: mapRazorpayRefundStatus(rRefund.status),
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
});

export const sendPaymentLink = catchAsyncError(
  async (req: Request, res: Response) => {
    const {
      externalRef,
      sourceApp,
      amount,
      currency,
      email,
      contact,
      metadata,
      name,
    } = req.body;

    try {
      const numAmount = Number(amount);
      if (!amount || Number.isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "invalid_amount" });
      }
      const amountInPaise = Math.round(numAmount * 100);
      const rOrder = await rzp.paymentLink.create({
        amount: amountInPaise,
        currency: currency,
        notes: {
          sourceApp,
          externalRef,
          ...metadata,
        },
        accept_partial: false,
        description: "Payment Link",
        customer: {
          name: name || "unknown",
          email: email,
          contact: contact,
        },
        notify: {
          sms: true,
          email: true,
        },
        reminder_enable: true,
        callback_url: "https://youtube.com",
        callback_method: "get",
      });

      await prisma.payment.create({
        data: {
          externalRef,
          sourceApp,
          amountPaise: BigInt(amountInPaise),
          currency,
          email: email || null,
          contact: contact || null,
          metadata: metadata || null,
          status: PaymentStatus.CREATED,
          razorpayPaymentLink: rOrder.id,
        },
      });

      console.log("Payment link created:", rOrder);
      return res.status(201).json({
        paymentLink: rOrder,
      });
    } catch (error) {
      console.error("Error creating payment link:", error);
      return res.status(500).json({ error: "internal_server_error" });
    }
  },
);
