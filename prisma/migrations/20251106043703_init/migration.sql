/*
  Warnings:

  - You are about to drop the column `orderId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[razorpayOrderId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `currency` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalRef` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sourceApp` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "orderId",
ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "externalRef" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "sourceApp" TEXT NOT NULL;

-- DropTable
DROP TABLE "Order";

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId");
