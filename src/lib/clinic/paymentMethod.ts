/**
 * Canonical patient payment methods and helpers for rendering them in UI.
 *
 * The `payments.payment_method` column stores either:
 *   - a canonical code: `cash` | `qr_pay` | `card` | `transfer`
 *   - a legacy free-text label (e.g. "TNG / DuitNow QR", "Credit/Debit Card")
 *   - a panel string: `Panel: {provider name}`
 *
 * `formatPaymentMethod` collapses all three into a short human label suitable
 * for badges and receipts. `paymentMethodBadgeClass` returns Tailwind classes
 * to colour-code the four canonical methods (legacy/panel falls back to slate).
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  qr_pay: 'QR Pay',
  card: 'Card',
  transfer: 'Transfer',
};

export const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'qr_pay', label: 'QR Pay / E-Wallet' },
  { value: 'card', label: 'Credit / Debit Card' },
  { value: 'transfer', label: 'Online Transfer' },
];

export function formatPaymentMethod(
  method: string | null | undefined,
  amount = 0,
): string {
  if (!method) return amount > 0 ? 'Cash (Legacy)' : '—';
  if (PAYMENT_METHOD_LABELS[method]) return PAYMENT_METHOD_LABELS[method];
  return method;
}

export function paymentMethodBadgeClass(method: string | null | undefined): string {
  switch (method) {
    case 'cash':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'qr_pay':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'card':
      return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'transfer':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}
