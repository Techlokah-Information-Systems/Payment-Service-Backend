/*
  Warnings:

  - A unique constraint covering the columns `[razorpayPaymentLinkId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "razorpayPaymentLinkId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentLinkId_key" ON "Payment"("razorpayPaymentLinkId");
