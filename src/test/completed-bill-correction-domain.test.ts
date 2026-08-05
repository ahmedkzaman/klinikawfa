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
  it.each([
    'ops_staff', 'operations', 'staff', 'purchaser', 'staff_nurse',
    'admin', 'special_admin', 'doctor_admin',
  ])(
    'allows %s to correct a completed bill',
    (role) => expect(canCorrectCompletedBill(role)).toBe(true),
  );

  it.each(['locum', 'resident_doctor', 'website_editor', 'guest', null])(
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

  it('rounds a fractional quantity line total to whole cents', () => {
    expect(calculateCompletedBillTotals({
      ...baseDraft,
      items: [{ ...baseItem, quantity: 0.5, price: 0.01 }],
      payments: [{ ...baseDraft.payments[0], amount: 0.01 }],
    })).toEqual({
      subtotal: 0.01,
      discountRm: 0,
      taxRm: 0,
      total: 0.01,
      paid: 0.01,
      outstanding: 0,
      creditDue: 0,
      status: 'paid',
    });
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
      'items.0.quantity': 'Quantity must be a whole number no greater than 1000000.',
      'items.0.price': 'Price must be a finite non-negative number.',
      'items.1.id': 'Item IDs must be unique.',
      'payments.0.paymentMethod': 'Enter a payment method for a positive payment.',
      'payments.1.id': 'Payment IDs must be unique.',
      discountRm: 'Discount must be a finite non-negative number.',
      taxPct: 'Tax must be a finite non-negative number.',
    });
  });

  it('matches the correction RPC financial bounds before allowing a submission', () => {
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      discountRm: 100000000,
      taxPct: 101,
      items: [{ ...baseItem, quantity: 1.5, price: 100000000 }],
      payments: [{ ...baseDraft.payments[0], amount: 1000000000 }],
    })).toMatchObject({
      discountRm: 'Discount cannot exceed RM 99999999.99.',
      taxPct: 'Tax must be between 0 and 100 percent.',
      'items.0.quantity': 'Quantity must be a whole number no greater than 1000000.',
      'items.0.price': 'Price cannot exceed RM 99999999.99.',
      'payments.0.amount': 'Payment amount cannot exceed RM 999999999.99.',
    });
  });

  it('rejects a zero-quantity new configured charge before the RPC', () => {
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      items: [{
        ...baseItem,
        id: null,
        quantity: 0,
        adjustmentKind: 'other_charge',
        chargeTypeId: 'charge-1',
      }],
    })).toMatchObject({
      'items.0.quantity': 'A new other charge must have a quantity above zero.',
    });
  });

  it('maps supported legacy and panel payment labels to the correction RPC vocabulary', () => {
    const context: CompletedBillCorrectionContext = {
      queueEntryId: 'queue-1', consultationId: 'consult-1', fingerprint: 'fingerprint',
      items: [baseItem],
      payments: [
        { ...baseDraft.payments[0], paymentMethod: 'TNG / DuitNow QR' },
        { ...baseDraft.payments[0], id: 'payment-2', paymentMethod: 'Panel: Acme Health' },
      ],
      originalTotals: {
        subtotal: 80, discountRm: 0, taxRm: 0, taxPct: 0, total: 80,
        paid: 80, outstanding: 0, creditDue: 0, status: 'paid',
      },
      panelClaim: null,
    };

    expect(toCompletedBillCorrectionPayload(context, {
      ...baseDraft,
      payments: context.payments,
    }).p_payments).toEqual([
      { id: 'payment-1', amount: 80, payment_method: 'qr_pay' },
      { id: 'payment-2', amount: 80, payment_method: 'panel' },
    ]);
  });

  it('treats payment UUID case variants as duplicates', () => {
    const paymentId = 'a0b1c2d3-e4f5-4678-9abc-def012345678';
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      payments: [
        { ...baseDraft.payments[0], id: paymentId },
        { ...baseDraft.payments[0], id: paymentId.toUpperCase() },
      ],
    })).toMatchObject({
      'payments.1.id': 'Payment IDs must be unique.',
    });
  });

  it('rejects whitespace-only reasons and normalizes reason whitespace in the payload', () => {
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      reason: '\t\n \r',
    })).toMatchObject({
      reason: 'Enter a correction reason of at least 3 characters.',
    });

    const context: CompletedBillCorrectionContext = {
      queueEntryId: 'queue-1', consultationId: 'consult-1', fingerprint: 'fingerprint',
      items: [baseItem], payments: baseDraft.payments, panelClaim: null,
    };
    expect(toCompletedBillCorrectionPayload(context, {
      ...baseDraft,
      reason: ' \tCorrect\n  payment\r\nmethod ',
    }).p_reason).toBe('Correct payment method');
  });

  it('rejects Unicode whitespace-only reasons and normalizes Unicode separators', () => {
    expect(validateCompletedBillCorrection({
      ...baseDraft,
      reason: '\u00a0\u2003\ufeff',
    })).toMatchObject({
      reason: 'Enter a correction reason of at least 3 characters.',
    });

    const context: CompletedBillCorrectionContext = {
      queueEntryId: 'queue-1', consultationId: 'consult-1', fingerprint: 'fingerprint',
      items: [baseItem], payments: baseDraft.payments, panelClaim: null,
    };
    expect(toCompletedBillCorrectionPayload(context, {
      ...baseDraft,
      reason: '\u00a0Correct\u2003payment\u202fmethod\ufeff',
    }).p_reason).toBe('Correct payment method');
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
