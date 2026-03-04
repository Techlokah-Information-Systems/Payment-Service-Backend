+--------------------+ +---------------------------------+ +-----------------+
| CLIENT APP | | PAYMENT GATEWAY MICROSERVICE | | RAZORPAY API |
| (e.g. ecommerce) | | (Express + Prisma + Razorpay) | | & WEBHOOKS |
+--------------------+ +---------------------------------+ +-----------------+
| | |
| 1 Create payment intent | |
|------------------------------------->| |
| POST /payments/initiate | |
| {externalRef, amount,...} | |
| | |
| | 2 Creates Razorpay Order ------>|  
 | | (via Razorpay SDK) |
| | |
| | 3 Stores Payment row in DB |
| | |
| 4 Responds {orderId, keyId,...} <-------------------------------------|
| | |
| 5 Opens Razorpay Checkout | |
| using orderId + keyId | |
|------------------------------------- Razorpay Checkout ----------------->|
| | |
| 6️ User completes payment | |
|<------------------------------------ Razorpay returns success ----------|
| | |
| 7️ Client POST /payments/confirm | |
| {order_id, payment_id, signature} | |
|------------------------------------->| |
| | 8️ Verify signature (HMAC) |
| | 9️ Fetch payment from Razorpay |
| | 10 Update DB (status=paid) |
|<-------------------------------------| |
| 11 Respond {status: "paid"} | |
| | |
| | 12 Razorpay sends webhook ----->|
| | /webhooks/razorpay |
| | (payment.captured, failed) |
| | |
| | 13 Verify webhook signature |
| | 14 Idempotent store event |
| | 15 Update payment status again |
| | (safe even if confirm already ran)|
| | |
| | 16 Respond 200 OK to Razorpay |
| | |
| | |
| | 17 Optional Refunds Flow |
|------------------------------------->|---------------------------------->|
| POST /payments/refund | Razorpay.refund(payment_id) |
| (amount, reason) | |
| | Store refund row in DB |
|<-------------------------------------| |
| 18 Respond {refundId, status} | |
| | |
