export interface PaymentSummary {
  id: string;
  deleted_at?: string | null;
  amount?: number | string | null;
}

export function isCompletedVisitUnpaid(payments: PaymentSummary[] | null | undefined): boolean {
  const paid = (payments ?? []).reduce((total, payment) =>
    payment.deleted_at ? total : total + Number(payment.amount ?? 0), 0);
  return paid <= 0.005;
}

export function isCashVisit(paymentMethod: string | null | undefined, panelId: string | null | undefined): boolean {
  return (paymentMethod ?? '').trim().toLowerCase() === 'cash' && !panelId;
}
