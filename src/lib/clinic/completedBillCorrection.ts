export type CompletedBillCorrectionRole =
  | 'ops_staff'
  | 'operations'
  | 'staff'
  | 'admin'
  | 'special_admin'
  | 'doctor_admin';

export type BillAdjustmentKind = 'other_charge' | 'discount' | 'tax';

export interface CompletedBillCorrectionItem {
  id: string | null;
  itemName: string;
  quantity: number;
  price: number;
  itemId: string | null;
  serviceId: string | null;
  packageId: string | null;
  dispensedQty: number | null;
  adjustmentKind: BillAdjustmentKind | null;
  chargeTypeId: string | null;
  remove: boolean;
}

export interface CompletedBillCorrectionPayment {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentType: string;
}

export interface CompletedBillCorrectionContext {
  queueEntryId: string;
  consultationId: string;
  fingerprint: string;
  items: CompletedBillCorrectionItem[];
  payments: CompletedBillCorrectionPayment[];
  originalTotals: CompletedBillTotals & { taxPct: number };
  panelClaim: {
    id: string;
    status: string;
    amount: number;
    receivedAmount: number | null;
  } | null;
}

export interface CompletedBillCorrectionDraft {
  items: CompletedBillCorrectionItem[];
  payments: CompletedBillCorrectionPayment[];
  discountRm: number;
  taxPct: number;
  reason: string;
}

export interface CompletedBillTotals {
  subtotal: number;
  discountRm: number;
  taxRm: number;
  total: number;
  paid: number;
  outstanding: number;
  creditDue: number;
  status: 'outstanding' | 'paid' | 'credit_due';
}

const ALLOWED = new Set<CompletedBillCorrectionRole>([
  'ops_staff', 'operations', 'staff', 'admin', 'special_admin', 'doctor_admin',
]);

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => value / 100;
const isNonNegativeFinite = (value: number) => Number.isFinite(value) && value >= 0;
const isWithin = (value: number, maximum: number) => isNonNegativeFinite(value) && value <= maximum;
const isWholeNumber = (value: number) => Number.isInteger(value);
const CORRECTION_PAYMENT_METHODS = new Set(['cash', 'qr_pay', 'card', 'transfer', 'panel']);
const REASON_WHITESPACE = new RegExp(
  '[\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a'
    + '\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+',
  'g',
);
const normalizeReason = (reason: string) =>
  reason.replace(REASON_WHITESPACE, ' ').trim();

export function canCorrectCompletedBill(role: string | null): boolean {
  return role !== null && ALLOWED.has(role as CompletedBillCorrectionRole);
}

/** Maps known historical labels to the controlled vocabulary accepted by the correction RPC. */
export function normalizeCompletedBillPaymentMethod(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (CORRECTION_PAYMENT_METHODS.has(normalized)) return normalized;
  if (normalized.startsWith('panel:')) return 'panel';
  if (/(qr|duitnow|tng|touch.?n.?go|e.?wallet)/.test(normalized)) return 'qr_pay';
  if (/(credit|debit|card)/.test(normalized)) return 'card';
  if (/(transfer|bank|fpx)/.test(normalized)) return 'transfer';
  if (/(cash|tunai)/.test(normalized)) return 'cash';
  return null;
}

export function calculateCompletedBillTotals(
  draft: CompletedBillCorrectionDraft,
): CompletedBillTotals {
  const subtotalCents = draft.items
    .filter((item) => !item.remove && (item.adjustmentKind === null || item.adjustmentKind === 'other_charge'))
    .reduce((sum, item) => sum + Math.round(cents(item.price) * item.quantity), 0);
  const discountCents = Math.min(cents(draft.discountRm), subtotalCents);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round(taxableCents * draft.taxPct / 100);
  const totalCents = taxableCents + taxCents;
  const paidCents = draft.payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const outstandingCents = Math.max(totalCents - paidCents, 0);
  const creditCents = Math.max(paidCents - totalCents, 0);

  return {
    subtotal: money(subtotalCents),
    discountRm: money(discountCents),
    taxRm: money(taxCents),
    total: money(totalCents),
    paid: money(paidCents),
    outstanding: money(outstandingCents),
    creditDue: money(creditCents),
    status: outstandingCents > 0 ? 'outstanding' : creditCents > 0 ? 'credit_due' : 'paid',
  };
}

export function validateCompletedBillCorrection(
  draft: CompletedBillCorrectionDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (normalizeReason(draft.reason).length < 3) {
    errors.reason = 'Enter a correction reason of at least 3 characters.';
  }
  if (!isWithin(draft.discountRm, 99999999.99)) {
    errors.discountRm = draft.discountRm > 99999999.99
      ? 'Discount cannot exceed RM 99999999.99.'
      : 'Discount must be a finite non-negative number.';
  }
  if (!isWithin(draft.taxPct, 100)) {
    errors.taxPct = Number.isFinite(draft.taxPct) && draft.taxPct > 100
      ? 'Tax must be between 0 and 100 percent.'
      : 'Tax must be a finite non-negative number.';
  }

  const itemIds = new Set<string>();
  draft.items.forEach((item, index) => {
    const field = `items.${index}`;
    if (!isWithin(item.quantity, 1000000) || !isWholeNumber(item.quantity)) {
      errors[`${field}.quantity`] = 'Quantity must be a whole number no greater than 1000000.';
    } else if (item.id === null && item.quantity <= 0) {
      errors[`${field}.quantity`] = 'A new other charge must have a quantity above zero.';
    }
    if (!isWithin(item.price, 99999999.99)) {
      errors[`${field}.price`] = item.price > 99999999.99
        ? 'Price cannot exceed RM 99999999.99.'
        : 'Price must be a finite non-negative number.';
    }
    if (item.dispensedQty !== null && item.quantity < item.dispensedQty) {
      errors[`${field}.quantity`] = `Quantity cannot be below the ${item.dispensedQty} already dispensed.`;
    }
    if (item.dispensedQty !== null && item.dispensedQty > 0 && item.remove) {
      errors[`${field}.remove`] = 'A dispensed medicine cannot be removed from the bill.';
    }
    if (item.id !== null) {
      if (itemIds.has(item.id)) errors[`${field}.id`] = 'Item IDs must be unique.';
      itemIds.add(item.id);
    }
  });

  const paymentIds = new Set<string>();
  draft.payments.forEach((payment, index) => {
    const field = `payments.${index}`;
    const normalizedId = payment.id.toLowerCase();
    if (!isWithin(payment.amount, 999999999.99)) {
      errors[`${field}.amount`] = payment.amount > 999999999.99
        ? 'Payment amount cannot exceed RM 999999999.99.'
        : 'Payment amount must be a finite non-negative number.';
    }
    if (payment.amount > 0 && payment.paymentMethod.trim().length === 0) {
      errors[`${field}.paymentMethod`] = 'Enter a payment method for a positive payment.';
    } else if (normalizeCompletedBillPaymentMethod(payment.paymentMethod) === null) {
      errors[`${field}.paymentMethod`] = 'Choose Cash, QR Pay, Card, Online Transfer, or Panel.';
    }
    if (paymentIds.has(normalizedId)) errors[`${field}.id`] = 'Payment IDs must be unique.';
    paymentIds.add(normalizedId);
  });

  return errors;
}

export function toCompletedBillCorrectionPayload(
  context: CompletedBillCorrectionContext,
  draft: CompletedBillCorrectionDraft,
) {
  return {
    p_queue_entry_id: context.queueEntryId,
    p_expected_fingerprint: context.fingerprint,
    p_reason: normalizeReason(draft.reason),
    p_items: draft.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      remove: item.remove,
      adjustment_kind: item.adjustmentKind,
      charge_type_id: item.chargeTypeId,
      item_name: item.itemName,
    })),
    p_payments: draft.payments.map((payment) => ({
      id: payment.id.toLowerCase(),
      amount: payment.amount,
      payment_method: normalizeCompletedBillPaymentMethod(payment.paymentMethod) ?? payment.paymentMethod.trim(),
    })),
    p_discount_rm: draft.discountRm,
    p_tax_pct: draft.taxPct,
  };
}
