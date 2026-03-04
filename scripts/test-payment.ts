import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "your_webhook_secret";

// Helper to generate webhook signature
function generateSignature(body: any): string {
  const payload = JSON.stringify(body);
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
}

async function runTests() {
  console.log(`🚀 Starting tests against ${BASE_URL}...\n`);

  try {
    // --- 1. Test Single Payment Flow ---
    console.log("--- 1. Testing Single Payment ---");
    const paymentRef = `pay_${Date.now()}`;

    // a. Initiate
    console.log("  > Initiating payment...");
    const initRes = await axios.post(`${BASE_URL}/payments/initiate`, {
      externalRef: paymentRef,
      amount: 500, // 5.00 INR
      currency: "INR",
      sourceApp: "test-script",
      description: "Test Payment",
    });
    console.log("    ✅ Initiated:", initRes.data);
    const { orderId } = initRes.data;

    // b. Simulate Webhook (payment.captured)
    console.log("  > Simulating Webhook (payment.captured)...");
    const capturedPayload = {
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_${Date.now()}`,
            order_id: orderId,
            amount: 50000,
            status: "captured",
            email: "test@example.com",
            contact: "+919999999999",
          },
        },
      },
    };

    await axios.post(`${BASE_URL}/webhooks/razorpay`, capturedPayload, {
      headers: {
        "X-Razorpay-Signature": generateSignature(capturedPayload),
        "Content-Type": "application/json",
      },
    });
    console.log("    ✅ Webhook processed successfully.");

    // --- 2. Test Subscription Flow ---
    console.log("\n--- 2. Testing Subscription ---");
    const subRef = `sub_${Date.now()}`;
    const planId = "plan_test_123"; // You might need a real plan ID from your Razorpay dashboard

    // a. Create Subscription
    // Note: This will fail if planId is invalid on Razorpay.
    // If you don't have a plan, create one on dashboard or mock the response if testing locally ensuring your controller handles mocks.
    // For this script, we'll try it, but catch error if plan doesn't exist.
    try {
      console.log("  > Creating Subscription...");
      const subRes = await axios.post(`${BASE_URL}/subscriptions/create`, {
        externalRef: subRef,
        planId: planId,
        totalCount: 12,
        quantity: 1,
        sourceApp: "test-script",
      });
      console.log("    ✅ Subscription Created:", subRes.data);

      const { subscriptionId } = subRes.data;

      // b. Simulate Webhook (subscription.authenticated)
      console.log("  > Simulating Webhook (subscription.charged)...");
      const subChargedPayload = {
        entity: "event",
        event: "subscription.charged",
        payload: {
          subscription: {
            entity: {
              id: subscriptionId,
              status: "active",
              current_start: Math.floor(Date.now() / 1000),
              current_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
              paid_count: 1,
              plan_id: planId,
              notes: {
                externalRef: subRef,
              },
            },
          },
          payment: {
            entity: {
              id: `pay_sub_${Date.now()}`,
              amount: 10000,
              status: "captured",
            },
          },
        },
      };

      await axios.post(`${BASE_URL}/webhooks/razorpay`, subChargedPayload, {
        headers: {
          "X-Razorpay-Signature": generateSignature(subChargedPayload),
          "Content-Type": "application/json",
        },
      });
      console.log("    ✅ Subscription Webhook processed.");
    } catch (e: any) {
      if (
        e.response?.data?.error === "bad_request_error" &&
        e.response?.data?.description?.includes("plan_id")
      ) {
        console.warn(
          "    ⚠️ Skipped Subscription Create: Plan ID invalid. Update 'plan_test_123' in scripts/test-payment.ts with a valid Razorpay Plan ID."
        );
      } else {
        console.error(
          "    ❌ Subscription Error:",
          e.response?.data || e.message
        );
      }
    }
  } catch (error: any) {
    console.error("\n❌ Test Failed:", error.response?.data || error.message);
  }
}

runTests();
