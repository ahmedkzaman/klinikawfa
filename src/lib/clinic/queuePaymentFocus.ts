export interface PaymentSummary {
  id: string;
  deleted_at?: string | null;
}

export function isCompletedVisitUnpaid(payments: PaymentSummary[] | null | undefined): boolean {
  return !(payments ?? []).some((payment) => !payment.deleted_at);
}

export function isCashVisit(paymentMethod: string | null | undefined, panelId: string | null | undefined): boolean {
  return paymentMethod === 'cash' && !panelId;
}
