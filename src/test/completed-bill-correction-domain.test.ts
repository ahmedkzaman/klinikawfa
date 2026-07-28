import { describe, expect, it } from 'vitest';
import {
  calculateCompletedBillTotals,
  canCorrectCompletedBill,
  toCompletedBillCorrectionPayload,
  validateCompletedBillCorrection,
  type CompletedBillCorrectionContext,
  type CompletedBillCorrectionDraft,
  type CompletedBillCorrectionItem,
} from '@/lib/clinic/completedBillCorrection';

const baseItem: CompletedBillCorrectionItem = {
  id: 'line-1',
  itemName: 'Procedure',
  quantity: 1,
  price: 80,
  itemId: null,
  serviceId: 'service-1',
  packageId: null,
  dispensedQty: null,
  adjustmentKind: null,
  chargeTypeId: null,
  remove: false,
};

const baseDraft: CompletedBillCorrectionDraft = {
  items: [baseItem],
  payments: [{
    id: 'payment-1',
    amount: 80,
    paymentMethod: 'cash',
    paymentType: 'self_pay',
  }],
  discountRm: 0,
  taxPct: 0,
  reason: 'Correct charge',
};

describe('completed bill corrections', () => {
  it.each(['ops_staff', 'operations', 'staff', 'admin', 'special_admin', 'doctor_admin'])(
    'allows %s to correct a completed bill',
    (role) => expect(canCorrectCompletedBill(role)).toBe(true),
  );

  it.each(['locum', 'resident_doctor', 'purchaser', 'staff_nurse', 'website_editor', 'guest', null])(
    'denies %s from correcting a completed bill',
    (role) => expect(canCorrectCompletedBill(role)).toBe(false),
  );

  it('calculates outstanding and credit due from corrected lines and payments', () => {
    const underpaid = calculateCompletedBillTotals({
      items: [{ ...baseItem, quantity: 2, price: 50 }],
      payments: [{ ...baseDraft.payments[0], amount: 70 }],
      discountRm: 10,
      taxPct: 10,
      reason: 'Correct charge',
    });
    expect(underpaid).toEqual({
      subtotal: 100,
      discountRm: 10,
      taxRm: 9,
      total: 99,
      paid: 70,
      outstanding: 29,
      creditDue: 0,
      status: 'outstanding',
    });

    const overpaid = calculateCompletedBillTotals({
      ...baseDraft,
      payments: [{ ...baseDraft.payments[0], amount: 100 }],
    });
    expect(overpaid.creditDue).toBe(20);
    expect(overpaid.status).toBe('credit_due');
  });

  it('rejects an empty reason and invalid dispensed medicine corrections', () => {
    expect(validateCompletedBillCorrection({ ...baseDraft, reason: '  ' })).toMatchObject({
      reason: 'Enter a correction reason of at least 3 characters.',
    });
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      items: [{ ...baseItem, itemId: 'medicine', serviceId: null, dispensedQty: 3, quantity: 2 }],
    })).toMatchObject({
      'items.0.quantity': 'Quantity cannot be below the 3 already dispensed.',
    });
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      items: [{ ...baseItem, itemId: 'medicine', serviceId: null, dispensedQty: 1, remove: true }],
    })).toMatchObject({
      'items.0.remove': 'A dispensed medicine cannot be removed from the bill.',
    });
  });

  it('rejects invalid amounts, payment methods, and duplicate identifiers', () => {
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      items: [{ ...baseItem, quantity: -1, price: Number.NaN }, { ...baseItem }],
      payments: [{ ...baseDraft.payments[0], amount: 1, paymentMethod: ' ' }, { ...baseDraft.payments[0] }],
      discountRm: -1,
      taxPct: Number.POSITIVE_INFINITY,
    })).toMatchObject({
      'items.0.quantity': 'Quantity must be a finite non-negative number.',
      'items.0.price': 'Price must be a finite non-negative number.',
      'items.1.id': 'Item IDs must be unique.',
      'payments.0.paymentMethod': 'Enter a payment method for a positive payment.',
      'payments.1.id': 'Payment IDs must be unique.',
      discountRm: 'Discount must be a finite non-negative number.',
      taxPct: 'Tax must be a finite non-negative number.',
    });
  });

  it('creates a trimmed RPC payload without dispensing data', () => {
    const context: CompletedBillCorrectionContext = {
      queueEntryId: 'queue-1', consultationId: 'consult-1', fingerprint: 'expected-fingerprint',
      items: [baseItem], payments: baseDraft.payments, panelClaim: null,
    };
    expect(toCompletedBillCorrectionPayload(context, {
      ...baseDraft,
      reason: '  Correct charge  ',
      payments: [{ ...baseDraft.payments[0], paymentMethod: '  cash  ' }],
    })).toEqual({
      p_queue_entry_id: 'queue-1',
      p_expected_fingerprint: 'expected-fingerprint',
      p_reason: 'Correct charge',
      p_items: [{
        id: 'line-1', quantity: 1, price: 80, remove: false,
        adjustment_kind: null, charge_type_id: null, item_name: 'Procedure',
      }],
      p_payments: [{ id: 'payment-1', amount: 80, payment_method: 'cash' }],
      p_discount_rm: 0,
      p_tax_pct: 0,
    });
  });
});
