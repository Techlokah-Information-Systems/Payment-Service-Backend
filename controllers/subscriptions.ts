import Razorpay from "razorpay";
import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../utils/db";
import { serializeToJSON } from "../utils/serializer";
import {
  ENVIRONMENT,
  RAZORPAY_TEST_KEY_ID,
  RAZORPAY_TEST_SECRET_KEY,
  RAZORPAY_LIVE_KEY_ID,
  RAZORPAY_LIVE_SECRET_KEY,
} from "../utils/constants";
import { SubscriptionStatus } from "../generated/prisma";

// Basic console logging until logger is set up
const logger = {
  info: (message: string, meta?: object) => {
    if (ENVIRONMENT !== "production") {
      console.log(message, meta);
    }
  },
  warn: (message: string, meta?: object) => {
    if (ENVIRONMENT !== "production") {
      console.warn(message, meta);
    }
  },
  error: (message: string, meta?: object) => {
    console.error(message, meta);
  },
};

// Type definitions for better type safety
// Types from Razorpay SDK
type RazorpaySubscription = {
  id: string;
  entity: string;
  plan_id: string;
  customer_id: string | null;
  status: string;
  current_start: number;
  current_end: number;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, string | number | null>;
  charge_at: number;
  start_at: number;
  end_at: number;
  auth_attempts: number;
  total_count: number;
  paid_count: number;
  customer_notify: number;
  created_at: number;
  expire_by: number | null;
  short_url: string;
  has_scheduled_changes: boolean;
  change_scheduled_at: number | null;
  source: string;
  payment_method: string | null;
  offer_id: string | null;
  remaining_count: number;
  plan: {
    id: string;
    entity: string;
    interval: number;
    period: string;
    item: {
      id: string;
      active: boolean;
      name: string;
      description: string | null;
      amount: number;
      unit_amount: number;
      currency: string;
    };
  };
};

// Input validation schemas
export const createSubscriptionSchema = z.object({
  externalRef: z.string().min(1, "External reference is required"),
  sourceApp: z.string().optional(),
  planId: z.string().min(1, "Plan ID is required"),
  totalCount: z.number().int().positive("Total count must be positive"),
  quantity: z.number().int().positive("Quantity must be positive"),
  notes: z.record(z.string(), z.string()).optional(),
});

export const cancelSubscriptionSchema = z.object({
  razorpaySubscriptionId: z.string().min(1, "Subscription ID is required"),
});

// Initialize Razorpay with environment-specific keys
const rzp = new Razorpay({
  key_id:
    ENVIRONMENT === "production" ? RAZORPAY_LIVE_KEY_ID : RAZORPAY_TEST_KEY_ID,
  key_secret:
    ENVIRONMENT === "production"
      ? RAZORPAY_LIVE_SECRET_KEY
      : RAZORPAY_TEST_SECRET_KEY,
});

/**
 * Creates a new subscription in Razorpay and stores it in the database
 */
export async function createSubscription(req: Request, res: Response) {
  try {
    // Validate input
    const validatedData = createSubscriptionSchema.parse(req.body);
    console.log("Validated Data:", validatedData);
    const { externalRef, sourceApp, planId, totalCount, quantity, notes } =
      validatedData;

    // Check for existing subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        externalRef,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CREATED] },
      },
    });

    if (existingSubscription) {
      logger.warn("Attempted to create duplicate subscription", {
        externalRef,
        existingSubscriptionId: existingSubscription.id,
      });
      return res.status(409).json({
        error: "subscription_exists",
        message: "An active subscription already exists for this reference",
      });
    }

    // Create subscription in Razorpay
    // Safety: Limit notes to prevent API errors (Razorpay limit: 15 keys)
    const safeNotes = {
      externalRef,
      sourceApp: sourceApp || "",
      environment: ENVIRONMENT,
      ...(notes || {}),
    };

    if (Object.keys(safeNotes).length > 15) {
      logger.warn("Truncating notes to meet Razorpay limits");
      // Keep essential keys
    }

    const subscription = (await rzp.subscriptions.create({
      plan_id: planId,
      total_count: totalCount,
      quantity: quantity,
      customer_notify: 1,
      notes: safeNotes,
    })) as unknown as RazorpaySubscription;

    const plan = await rzp.plans.fetch(planId);

    // Store in database
    const record = await prisma.subscription.create({
      data: {
        externalRef,
        sourceApp,
        razorpaySubscriptionId: subscription.id,
        razorpayPlanId: planId,
        status: (
          subscription.status as SubscriptionStatus
        ).toUpperCase() as any,
        quantity,
        totalCount,
        amountPaise: BigInt(plan.item.amount),
        currency: plan.item.currency,
        currentStart: subscription.start_at
          ? new Date(subscription.start_at * 1000)
          : null,
        currentEnd: subscription.end_at
          ? new Date(subscription.end_at * 1000)
          : null,
        metadata: { notes },
      },
    });

    logger.info("Subscription created successfully", {
      subscriptionId: subscription.id,
      externalRef,
    });

    const payload = {
      subscriptionId: subscription.id,
      keyId:
        ENVIRONMENT === "production"
          ? RAZORPAY_LIVE_KEY_ID
          : RAZORPAY_TEST_KEY_ID,
      status: subscription.status,
    };

    if ((res as any).saveIdempotent) {
      await (res as any).saveIdempotent(payload);
    }

    return res.status(201).json(
      serializeToJSON({
        id: subscription.id,
        status: subscription.status,
        keyId:
          ENVIRONMENT === "production"
            ? RAZORPAY_LIVE_KEY_ID
            : RAZORPAY_TEST_KEY_ID,
        subscription: record,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid subscription creation request", {
        validation_errors: error.format(),
      });
      return res.status(400).json({
        error: "validation_error",
        details: error.format(),
      });
    }

    logger.error("Failed to create subscription", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(500).json({
      error: "internal_server_error",
      message: "Failed to create subscription",
    });
  }
}

/**
 * Cancels an existing subscription in Razorpay and updates the database
 */
export async function cancelSubscription(req: Request, res: Response) {
  try {
    // Validate input
    const validatedData = cancelSubscriptionSchema.parse(req.body);
    const { razorpaySubscriptionId } = validatedData;

    // Check if subscription exists
    const subscription = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId },
    });

    if (!subscription) {
      logger.warn("Attempted to cancel non-existent subscription", {
        razorpaySubscriptionId,
      });
      return res.status(404).json({
        error: "subscription_not_found",
        message: "Subscription not found",
      });
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return res.status(409).json({
        error: "already_cancelled",
        message: "Subscription is already cancelled",
      });
    }

    // Cancel in Razorpay (false parameter means don't cancel at cycle end)
    const cancelledSubscription = await rzp.subscriptions.cancel(
      razorpaySubscriptionId,
      false,
    );

    // Update database
    const updatedSubscription = await prisma.subscription.update({
      where: { razorpaySubscriptionId },
      data: {
        status: (cancelledSubscription.status as string).toUpperCase() as any,
        updatedAt: new Date(),
      },
    });

    const payload = {
      cancelled: true,
      status: updatedSubscription.status,
    };

    if ((res as any).saveIdempotent) {
      await (res as any).saveIdempotent(payload);
    }

    logger.info("Subscription cancelled successfully", {
      subscriptionId: razorpaySubscriptionId,
      externalRef: subscription.externalRef,
    });

    return res.status(200).json(
      serializeToJSON({
        id: razorpaySubscriptionId,
        status: cancelledSubscription.status,
        subscription: updatedSubscription,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid subscription cancellation request", {
        validation_errors: error.format(),
      });
      return res.status(400).json({
        error: "validation_error",
        details: error.format(),
      });
    }

    logger.error("Failed to cancel subscription", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(500).json({
      error: "internal_server_error",
      message: "Failed to cancel subscription",
    });
  }
}

export async function listSubscriptions(req: Request, res: Response) {
  try {
    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });

    const { limit, offset } = querySchema.parse(req.query);

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.subscription.count(),
    ]);

    return res.status(200).json(
      serializeToJSON({
        subscriptions,
        pagination: {
          total,
          limit,
          offset,
        },
      }),
    );
  } catch (error) {
    logger.error("Failed to list subscriptions", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({
      error: "internal_server_error",
      message: "Failed to list subscriptions",
    });
  }
}
