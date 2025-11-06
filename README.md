# Payment Service Backend

A robust and secure payment microservice built with Express.js, TypeScript, and Prisma, integrated with Razorpay payment gateway.

## Features

- 🔒 Secure payment processing with Razorpay
- ♻️ Idempotency support for safe retries
- 🪝 Webhook handling for payment updates
- 📊 Database tracking for payments and refunds
- 🔍 Comprehensive payment lifecycle management
- 🚀 Built with TypeScript for type safety
- 📝 Prisma ORM for database operations

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- Razorpay account and API keys
- ngrok (for local webhook testing)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/payment_service"
RAZORPAY_TEST_KEY_ID="your_test_key_id"
RAZORPAY_TEST_SECRET_KEY="your_test_secret_key"
RAZORPAY_WEBHOOK_SECRET="your_webhook_secret"
ENVIRONMENT="development"
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
4. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

## API Endpoints

### 1. Initiate Payment

```http
POST /payments/initiate
```

Request body:

```json
{
  "externalRef": "order_123",
  "sourceApp": "ecommerce",
  "amount": 1000, // Amount in smallest currency unit (paise for INR)
  "currency": "INR",
  "email": "customer@example.com",
  "contact": "+919876543210",
  "metadata": {
    "productId": "prod_123",
    "customerId": "cust_456"
  }
}
```

Headers:

```
Idempotency-Key: unique_request_id
```

### 2. Confirm Payment

```http
POST /payments/confirm
```

Request body:

```json
{
  "razorpay_order_id": "order_123",
  "razorpay_payment_id": "pay_123",
  "razorpay_signature": "signature"
}
```

### 3. Webhook Endpoint

```http
POST /webhooks/razorpay
```

## Database Schema

### Payment Model

- Tracks all payment attempts and their status
- Stores payment details including amount, currency, and customer info
- Links to refunds if any are issued

### Refund Model

- Records all refund transactions
- Links back to the original payment
- Tracks refund status and reason

### IdempotencyKey Model

- Ensures safe retry of operations
- Prevents duplicate transactions
- Scoped by operation type

### WebhookEvent Model

- Records all incoming webhook events
- Stores complete event data for audit
- Links events to payments where applicable

## Security Features

1. **Rate Limiting**: Prevents abuse of the API
2. **Helmet**: Adds various HTTP headers for security
3. **CORS**: Configurable cross-origin resource sharing
4. **Request Size Limits**: Prevents large payload attacks
5. **Signature Verification**: For webhook and payment confirmation

## Error Handling

The service returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (invalid input)
- `401`: Unauthorized
- `409`: Conflict (duplicate request)
- `500`: Internal Server Error

## Development

Start the development server:

```bash
npm run dev
```

For webhook testing, use ngrok:

```bash
ngrok http 3000
```

## Testing Payments

1. Initiate a payment with test credentials
2. Use Razorpay test cards for payment simulation
3. Monitor webhooks for payment status updates

## Production Deployment

1. Set environment to production
2. Use production Razorpay credentials
3. Ensure proper SSL/TLS configuration
4. Set up monitoring and logging
5. Configure production database

## Monitoring and Maintenance

- Monitor webhook delivery and processing
- Check payment reconciliation regularly
- Monitor database performance
- Keep dependencies updated
- Regular security audits

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[MIT License](LICENSE)

---

For more information or support, please contact the development team.
