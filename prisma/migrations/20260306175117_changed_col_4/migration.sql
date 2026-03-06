/*
  Warnings:

  - You are about to drop the column `razorpayPaymentLinkId` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[razorpayPaymentLink]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Payment_razorpayPaymentLinkId_key";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "razorpayPaymentLinkId",
ADD COLUMN     "razorpayPaymentLink" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentLink_key" ON "Payment"("razorpayPaymentLink");
