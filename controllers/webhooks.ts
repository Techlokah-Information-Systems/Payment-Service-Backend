import crypto from "node:crypto";
import prisma from "../utils/db";
import { Request, Response } from "express";
import { RAZORPAY_WEBHOOK_SECRET } from "../utils/constants";
import {
  mapRazorpayPaymentStatus,
  mapRazorpaySubscriptionStatus,
  mapRazorpayInvoiceStatus,
} from "../utils/mappers";

export async function handleWebhook(req: Request, res: Response) {
  const signature = req.header("X-Razorpay-Signature");
  const webhookSecret = RAZORPAY_WEBHOOK_SECRET;
  const rawBody = (req as any).body;

  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "server_configuration_error" });
  }

  if (!signature) {
    return res.status(400).json({ error: "missing_signature" });
  }

  if (!Buffer.isBuffer(rawBody)) {
    console.error(
      "Invalid raw body type - ensure express.raw({ type: 'application/json' }) is configured.",
    );
    return res.status(400).json({ error: "invalid_raw_body" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const generatedSignatureBuffer = Buffer.from(expectedSignature);
  const receivedSignatureBuffer = Buffer.from(signature);

  if (
    generatedSignatureBuffer.length !== receivedSignatureBuffer.length ||
    !crypto.timingSafeEqual(generatedSignatureBuffer, receivedSignatureBuffer)
  ) {
    return res.status(400).json({ error: "invalid_signature" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    return res.status(400).json({ error: "invalid_json_body", message: error });
  }

  const eventId =
    event?.id ||
    `${event?.event}:${event?.payload?.payment?.entity?.id || Date.now()}`;

  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType: event.event,
        body: event,
        paymentId: event?.payload?.payment?.entity?.id || undefined,
      },
    });
  } catch (error) {
    // Idempotency: If duplicate event, we treat it as success
    console.warn("Duplicate webhook event received or DB error:", error);
    return res.status(200).json({ status: "processed_duplicate" });
  }

  try {
    if (event.event.startsWith("subscription.")) {
      const s = event.payload.subscription.entity;
      await prisma.subscription.upsert({
        where: { razorpaySubscriptionId: s.id },
        update: {
          status: mapRazorpaySubscriptionStatus(s.status),
          currentStart: s.current_start
            ? new Date(s.current_start * 1000)
            : null,
          currentEnd: s.current_end ? new Date(s.current_end * 1000) : null,
          paidCount: s.paid_count,
          remainingCount: s.remaining_count,
        },
        create: {
          externalRef: s.notes?.externalRef || "",
          razorpaySubscriptionId: s.id,
          status: mapRazorpaySubscriptionStatus(s.status),
          razorpayPlanId: s.plan_id,
          amountPaise: s.plan?.amount ? BigInt(s.plan.amount) : null,
          currency: s.plan?.currency ?? "INR",
        },
      });
    } else if (event.event.startsWith("invoice.")) {
      const i = event.payload.invoice.entity;
      const invoiceData = {
        razorpayInvoiceId: i.id,
        razorpayPaymentId: i.payment_id || null,
        amountPaise: i.amount != null ? BigInt(i.amount) : null,
        currency: i.currency,
        status: mapRazorpayInvoiceStatus(i.status),
        dueAt: i.due_at ? new Date(i.due_at * 1000) : null,
        paidAt: i.paid_at ? new Date(i.paid_at * 1000) : null,
      };

      const createData: any = {
        ...invoiceData,
        subscription: i.subscription_id
          ? { connect: { razorpaySubscriptionId: i.subscription_id } }
          : undefined,
      };

      await prisma.invoice.upsert({
        where: { razorpayInvoiceId: i.id },
        update: invoiceData,
        create: createData,
      });
    } else if (
      event.event === "payment.captured" ||
      event.event === "payment.authorized" ||
      event.event === "payment.failed"
    ) {
      const paymentEntity = event.payload.payment.entity;
      const rOrderId = paymentEntity.order_id;
      const rPayId = paymentEntity.id;

      if (rOrderId) {
        const paymentRow = await prisma.payment.findFirst({
          where: { razorpayOrderId: rOrderId },
        });

        if (paymentRow) {
          if (event.event === "payment.failed") {
            await prisma.payment.update({
              where: { id: paymentRow.id },
              data: {
                status: mapRazorpayPaymentStatus(paymentEntity.status),
                razorpayPaymentId: rPayId, // Track the failed payment ID too
              },
            });
          } else {
            await prisma.payment.update({
              where: { id: paymentRow.id },
              data: {
                razorpayPaymentId: rPayId,
                status: mapRazorpayPaymentStatus(paymentEntity.status),
                amountPaise: BigInt(paymentEntity.amount),
              },
            });
          }
        }
      }
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("Error processing webhook logic:", e);
    // Return 500 so Razorpay retries if it's a transient logic error
    return res.status(500).json({ error: "internal_server_error" });
  }
}
