# Payment Service SDK & API Documentation

This document provides detailed instructions for developers within the company on how to integrate and use the Payment Service Backend.

The service is built on top of **Node.js, Express, Prisma (PostgreSQL), and Razorpay**. It supports one-time payments, subscriptions, invoicing, and refunds, while emphasizing a secure **webhook-first** state-synchronization pattern.

---

## General Architecture & Flow

The Payment Service acts as an intermediary between our client applications (frontend web/mobile apps) and the Razorpay gateway.

**Core Principle**: Never trust the client for payment status updates.

1. The Client **initiates** a payment via our Backend.
2. The Backend creates an `Order` and returns the requisite keys to the Client.
3. The Client opens the Razorpay UI widget and completes the transaction directly with Razorpay.
4. Razorpay sends a secure **Webhook** to our Backend.
5. Our Backend verifies the webhook signature and securely updates the database (`CAPTURED`, `FAILED`, etc.).

---

## 1. Idempotency

Several endpoints require an `Idempotency-Key` header. This prevents accidental double-charging if a user clicks a button twice or a network request is retried.

```http
Idempotency-Key: <UUID or Unique string per request>
```

When you send a request with an existing idempotency key, the backend will return the exact same response it generated the first time without reprocessing the transaction.

---

## 2. One-Time Payments

### A. Initiate Payment

Use this endpoint to start a payment flow. This creates a Razorpay Order and a database record with a `CREATED` status.

**Endpoint:** `POST /payments/initiate`  
**Headers:** `Idempotency-Key: <unique-uuid>`

**Request Body:**

```json
{
  "externalRef": "order_78910", // Required: Your internal reference ID
  "sourceApp": "mobile_app", // Optional: Identifies the calling application
  "amount": 500, // Required: Amount in standard base unit (e.g., 500 INR/USD)
  "currency": "INR", // Required: 3-letter currency code
  "email": "user@example.com", // Optional: Customer email
  "contact": "+919876543210", // Optional: Customer phone
  "metadata": {
    // Optional: Custom JSON payload
    "cartId": "cart_123"
  }
}
```

**Response (201 Created):**

```json
{
  "orderId": "order_Mabc12345",
  "keyId": "rzp_test_123456",
  "amount": 50000, // Notice: Converted to Paise/Cents (amount * 100)
  "currency": "INR"
}
```

### B. Client-side Execution

On your frontend, use the returned data to open the Razorpay Checkout widget.

```javascript
const options = {
  key: response.keyId,
  amount: response.amount,
  currency: response.currency,
  order_id: response.orderId,
  // ... handler and prefill options
};
const rzp = new Razorpay(options);
rzp.open();
```

### C. Verification (Webhook Driven)

You do **not** need to call a verification API from the frontend. The backend listens for `payment.captured` or `payment.failed` webhooks from Razorpay and updates the `Payment` table automatically.

_(Note: There is a legacy endpoint `POST /payments/confirm` available, but its use is restricted/deprecated to avoid race conditions. Stick to listening for backend DB changes or websocket updates if applicable.)_

---

## 3. Subscriptions & Invoices

The backend handles Subscriptions natively via webhooks. Unlike one-time payments that you initiate through our backend, subscriptions are generally created using Razorpay APIs natively (or via future endpoints).

Once a subscription is active, the Payment Service automatically listens to the following Webhooks and upserts the data into our PostgreSQL database:

- `subscription.created`
- `subscription.authenticated`
- `subscription.active`
- `subscription.paused`
- `subscription.cancelled`
- `subscription.completed`
- `subscription.expired`

**What happens locally:**

1. The backend reads the Razorpay notification.
2. It maps Razorpay statuses (e.g., `'active'`) to our strict database Enums (e.g., `SubscriptionStatus.ACTIVE`).
3. It creates or updates the `Subscription` and `Invoice` records automatically.
4. **Action item for other developers**: You simply need to query the `Subscription` table where `customerRef` or `externalRef` matches your user to check if they have premium access.

---

## 4. Refunds

If you need to refund a customer, use the Refund API.

**Endpoint:** `POST /payments/refund`  
**Headers:** `Idempotency-Key: <unique-uuid>`

**Request Body:**

```json
{
  "paymentRef": "order_78910", // The database `id` OR the `externalRef` you provided initially
  "amount": 200, // Optional: For partial refunds. If omitted, full refund is processed.
  "reason": "Customer requested cancellation"
}
```

**Response (201 Created):**

```json
{
  "refundId": "rfnd_Mxyz9876",
  "status": "processed" // Extracted and mapped to RefundStatus enum
}
```

---

## 5. Webhooks Configuration (For DevOps/Admins)

Ensure the Razorpay dashboard is configured to point its webhooks to our production URL:

`POST https://api.yourdomain.com/webhooks/razorpay`

**Events to subscribe to:**

- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `refund.created`
- `refund.processed`
- `refund.failed`
- `subscription.*` (All subscription events)
- `invoice.*` (All invoice events)

**Secret:**
Ensure `RAZORPAY_WEBHOOK_SECRET` in the `.env` file matches the secret set in the Razorpay dashboard exactly.

---

## 6. Database Schema Types & Enums Note

All monetary values are stored in the database as **`BigInt` representing the smallest currency unit (e.g., paise, cents)**.

- If you initiate a payment for `500` (INR), the database `amountPaise` will safely store `50000`.

Status enumerations are strictly typed:

- `PaymentStatus`: `CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`
- `SubscriptionStatus`: `CREATED`, `ACTIVE`, `PAUSED`, `CANCELLED`, `COMPLETED`, `EXPIRED`
- `InvoiceStatus`: `DRAFT`, `ISSUED`, `PAID`, `PARTIALLY_PAID`, `CANCELLED`, `EXPIRED`

When querying Prisma via your own microservices, you must import the Enums directly from `@prisma/client`.
