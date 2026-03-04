import {
  PaymentStatus,
  RefundStatus,
  SubscriptionStatus,
  InvoiceStatus,
} from "../generated/prisma";

export function mapRazorpayPaymentStatus(status: string): PaymentStatus {
  switch (status.toLowerCase()) {
    case "created":
      return PaymentStatus.CREATED;
    case "authorized":
      return PaymentStatus.AUTHORIZED;
    case "captured":
      return PaymentStatus.CAPTURED;
    case "failed":
      return PaymentStatus.FAILED;
    case "refunded":
      return PaymentStatus.REFUNDED;
    default:
      return PaymentStatus.CREATED; // Default or fallback
  }
}

export function mapRazorpayRefundStatus(status: string): RefundStatus {
  switch (status.toLowerCase()) {
    case "created":
      return RefundStatus.CREATED;
    case "processed":
      return RefundStatus.PROCESSED;
    case "failed":
      return RefundStatus.FAILED;
    default:
      return RefundStatus.CREATED;
  }
}

export function mapRazorpaySubscriptionStatus(
  status: string,
): SubscriptionStatus {
  switch (status.toLowerCase()) {
    case "created":
    case "authenticated":
      return SubscriptionStatus.CREATED;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "paused":
      return SubscriptionStatus.PAUSED;
    case "cancelled":
      return SubscriptionStatus.CANCELLED;
    case "completed":
      return SubscriptionStatus.COMPLETED;
    case "expired":
      return SubscriptionStatus.EXPIRED;
    default:
      return SubscriptionStatus.CREATED;
  }
}

export function mapRazorpayInvoiceStatus(status: string): InvoiceStatus {
  switch (status.toLowerCase()) {
    case "draft":
      return InvoiceStatus.DRAFT;
    case "issued":
      return InvoiceStatus.ISSUED;
    case "paid":
      return InvoiceStatus.PAID;
    case "partially_paid":
      return InvoiceStatus.PARTIALLY_PAID;
    case "cancelled":
      return InvoiceStatus.CANCELLED;
    case "expired":
      return InvoiceStatus.EXPIRED;
    default:
      return InvoiceStatus.DRAFT;
  }
}
