import crypto from "node:crypto";
import prisma from "../utils/db";
import { Request, Response } from "express";
import { RAZORPAY_WEBHOOK_SECRET } from "../utils/constants";

export async function handleWebhook(req: Request, res: Response) {
  const signature = req.header("X-Razorpay-Signature") || "";
  const webhookSecret = RAZORPAY_WEBHOOK_SECRET;
  const rawBody = (req as any).body as Buffer;

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    return res.status(400).json({ error: "invalid_signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const eventId =
    event?.id || `${event?.event}:${event?.payload?.payment?.entity?.id || ""}`;

  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType: event.event,
        body: event,
        paymentId: event?.payload?.payment?.entity?.id || "",
      },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(200).json({ error: "duplicate" });
  }

  if (
    event.event === "payment.captured" ||
    event.event === "payment.authorized"
  ) {
    const rPayId = event.payload.payment.entity.id;
    const rOrderId = event.payload.payment.entity.order_id;

    const paymentRow = await prisma.payment.findFirst({
      where: {
        razorpayOrderId: rOrderId,
      },
    });

    if (paymentRow) {
      await prisma.payment.update({
        where: { id: paymentRow.id },
        data: {
          razorpayPaymentId: rPayId,
          status:
            event.event === "payment.captured" ? "captured" : "authorized",
          amountPaise: event.payload.payment.entity.amount,
        },
      });
    } else if (event.event === "payment.failed") {
      const rOrderId = event.payload.payment.entity.order_id;
      const paymentRow = await prisma.payment.findFirst({
        where: {
          razorpayOrderId: rOrderId,
        },
      });

      if (paymentRow) {
        await prisma.payment.update({
          where: { id: paymentRow.id },
          data: {
            status: "failed",
          },
        });
      }
    } else if (
      event.event === "refund.processed" ||
      event.event === "refund.failed"
    ) {
      // TODO: Handle refund events if necessary
    }
  }

  return res.status(200).send("ok");
}
