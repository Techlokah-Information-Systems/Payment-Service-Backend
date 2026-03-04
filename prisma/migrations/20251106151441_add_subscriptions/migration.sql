-- CreateTable
CREATE TABLE "Subscription" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "externalRef" TEXT NOT NULL,
    "sourceApp" TEXT,
    "razorpaySubscriptionId" TEXT,
    "razorpayPlanId" TEXT,
    "razorpayCustomerId" TEXT,
    "status" TEXT NOT NULL,
    "quantity" INTEGER,
    "totalCount" INTEGER,
    "paidCount" INTEGER,
    "remainingCount" INTEGER,
    "amountPaise" BIGINT,
    "currency" TEXT,
    "currentStart" TIMESTAMP(3),
    "currentEnd" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" BIGINT,
    "razorpayInvoiceId" TEXT,
    "razorpayPaymentId" TEXT,
    "amountPaise" BIGINT,
    "currency" TEXT,
    "status" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_razorpaySubscriptionId_key" ON "Subscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_razorpayInvoiceId_key" ON "Invoice"("razorpayInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
