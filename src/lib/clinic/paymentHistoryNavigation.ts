export function paymentVisitPath(
  queueEntryId: string,
  paymentId?: string,
): string {
  const basePath = `/clinic/visits/${encodeURIComponent(queueEntryId)}`;
  if (!paymentId) return basePath;

  return `${basePath}?payment=${encodeURIComponent(paymentId)}`;
}

export function parsePaymentVisitLocation(search: string): {
  paymentId: string | null;
} {
  const params = new URLSearchParams(search);
  const paymentId = params.get('payment');

  return { paymentId: paymentId?.trim() ? paymentId : null };
}
