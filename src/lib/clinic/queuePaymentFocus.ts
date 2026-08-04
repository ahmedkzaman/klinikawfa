export interface PaymentSummary {
  id: string;
  deleted_at?: string | null;
  amount?: number | string | null;
}

export interface BillingLineSummary {
  quantity?: number | string | null;
  price?: number | string | null;
  deleted_at?: string | null;
}

export type CompletedPaymentStatus = {
  kind: "no-payment" | "partial-payment" | "paid" | "unavailable";
  billed: number | null;
  paid: number;
  outstanding: number | null;
};

export function getCompletedPaymentStatus(
  payments: PaymentSummary[] | null | undefined,
  billingLines: BillingLineSummary[] | null | undefined,
): CompletedPaymentStatus {
  const activeLines = (billingLines ?? []).filter((line) => !line.deleted_at);
  const billed = activeLines.length > 0
    ? activeLines.reduce(
        (total, line) => total + Number(line.quantity ?? 1) * Number(line.price ?? 0),
        0,
      )
    : null;
  const paid = (payments ?? []).reduce(
    (total, payment) => payment.deleted_at ? total : total + Number(payment.amount ?? 0),
    0,
  );
  if (billed === null) return { kind: "unavailable", billed, paid, outstanding: null };
  const outstanding = Math.max(billed - paid, 0);
  return {
    kind: outstanding > 0.005 ? (paid > 0.005 ? "partial-payment" : "no-payment") : "paid",
    billed,
    paid,
    outstanding,
  };
}

export function isCompletedVisitPaymentIncomplete(
  payments: PaymentSummary[] | null | undefined,
  billingLines: BillingLineSummary[] | null | undefined,
): boolean {
  const status = getCompletedPaymentStatus(payments, billingLines);
  return status.kind === "no-payment" || status.kind === "partial-payment";
}

export function isCompletedVisitUnpaid(payments: PaymentSummary[] | null | undefined): boolean {
  const paid = (payments ?? []).reduce((total, payment) =>
    payment.deleted_at ? total : total + Number(payment.amount ?? 0), 0);
  return paid <= 0.005;
}

export function isCashVisit(paymentMethod: string | null | undefined, panelId: string | null | undefined): boolean {
  return (paymentMethod ?? '').trim().toLowerCase() === 'cash' && !panelId;
}
