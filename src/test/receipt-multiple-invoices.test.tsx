import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReceiptTemplate, type ReceiptData } from '@/components/clinic/billing/ReceiptTemplate';
import { calculateDualLedger, sumPatientCollectibleBalance } from '@/lib/clinic/dualLedger';
import {
  buildReceiptData,
  receiptErrorMessage,
  type PaymentBatchReceiptSnapshot,
} from '@/lib/clinic/receiptPayload';

describe('multi-invoice debt receipt', () => {
  it('loads durable batch invoice provenance through the authorized receipt snapshot', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/clinic/billing/PrintReceiptDialog.tsx',
    ), 'utf8');
    const migration = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260812174507_add_split_patient_payments.sql',
    ), 'utf8');
    const printSource = readFileSync(resolve(
      process.cwd(),
      'src/lib/clinic/printReceipt.ts',
    ), 'utf8');
    const payloadSource = readFileSync(resolve(
      process.cwd(),
      'src/lib/clinic/receiptPayload.ts',
    ), 'utf8');

    expect(source).toContain("rpc('get_payment_batch_receipt'");
    expect(payloadSource).toContain('selected_queue_entry_ids');
    expect(payloadSource).toContain('ledger_payments');
    expect(source).not.toContain(".from('panel_claims')");
    expect(migration).toMatch(/get_payment_batch_receipt[\s\S]*'ledger_payments'/i);
    expect(printSource).toContain("drawTotalsRow('Billed to Panel (RM)'");
  });

  it('groups every historical invoice and shows a subtotal for each group', () => {
    const data = {
      paymentId: 'payment-1', paymentMethod: 'cash', paymentType: 'self_pay',
      amountPaid: 75, createdAt: '2026-08-13T08:00:00.000Z', queueLabel: null,
      patientName: 'Aminah', patientIc: null,
      items: [
        { name: 'Consultation A', quantity: 1, unit_price: 50, line_total: 50 },
        { name: 'Consultation B', quantity: 1, unit_price: 100, line_total: 100 },
      ],
      invoiceGroups: [
        {
          id: 'queue-a', label: 'Invoice Q-001 · 01 Aug 2026', subtotal: 50,
          items: [{ name: 'Consultation A', quantity: 1, unit_price: 50, line_total: 50 }],
        },
        {
          id: 'queue-b', label: 'Invoice Q-002 · 05 Aug 2026', subtotal: 100,
          items: [{ name: 'Consultation B', quantity: 1, unit_price: 100, line_total: 100 }],
        },
      ],
      subtotal: 150, invoiceTotal: 150, balanceRemaining: 75,
      paymentPortions: [
        { id: 'payment-1', method: 'cash', amount: 50 },
        { id: 'payment-2', method: 'cash', amount: 25 },
      ],
    } as ReceiptData;

    render(<ReceiptTemplate data={data} settings={{ clinic_name: 'Klinik Awfa' }} />);

    expect(screen.getByText('Invoice Q-001 · 01 Aug 2026')).toBeVisible();
    expect(screen.getByText('Invoice Q-002 · 05 Aug 2026')).toBeVisible();
    expect(screen.getByText('Invoice subtotal RM 50.00')).toBeVisible();
    expect(screen.getByText('Invoice subtotal RM 100.00')).toBeVisible();
    expect(screen.getAllByText('150.00')).toHaveLength(2);
  });

  it('keeps every selected invoice on a partial FIFO settlement receipt', () => {
    const data = buildReceiptData({
      payment: {
        id: 'payment-a', batch_id: 'batch-1', amount: 25, payment_method: 'cash',
        payment_type: 'self_pay', created_at: '2026-08-13T08:00:00Z',
        queue_entry_id: 'queue-a', consultation_id: 'consultation-a', deleted_at: null,
      },
      receipt_id: 'batch-1',
      selected_queue_entry_ids: ['queue-a', 'queue-b'],
      payments: [{
        id: 'payment-a', batch_id: 'batch-1', amount: 25, payment_method: 'cash',
        payment_type: 'self_pay', created_at: '2026-08-13T08:00:00Z',
        queue_entry_id: 'queue-a', consultation_id: 'consultation-a', deleted_at: null,
      }],
      ledger_payments: [{
        id: 'payment-a', batch_id: 'batch-1', amount: 25, payment_method: 'cash',
        payment_type: 'self_pay', created_at: '2026-08-13T08:00:00Z',
        queue_entry_id: 'queue-a', consultation_id: 'consultation-a', deleted_at: null,
      }],
      queue_entries: [
        { id: 'queue-a', queue_sequence: 1, created_at: '2026-08-01T08:00:00Z', patient: { name: 'Aminah', national_id: null, date_of_birth: null } },
        { id: 'queue-b', queue_sequence: 2, created_at: '2026-08-05T08:00:00Z', patient: { name: 'Aminah', national_id: null, date_of_birth: null } },
      ],
      consultations: [
        { id: 'consultation-a', queue_entry_id: 'queue-a' },
        { id: 'consultation-b', queue_entry_id: 'queue-b' },
      ],
      items: [
        { consultation_id: 'consultation-a', item_name: 'Consultation A', quantity: 1, price: 50 },
        { consultation_id: 'consultation-b', item_name: 'Consultation B', quantity: 1, price: 100 },
      ],
      panel_claims: [],
    } satisfies PaymentBatchReceiptSnapshot);

    expect(data).toMatchObject({
      receiptId: 'batch-1', amountPaid: 25, invoiceTotal: 150, balanceRemaining: 125,
    });
    expect(data?.invoiceGroups?.map((group) => group.id)).toEqual(['queue-a', 'queue-b']);
  });

  it('keeps the uncovered part of a panel invoice in the patient balance', () => {
    const ledger = calculateDualLedger({
      billedTotal: 100,
      patientPayments: [15],
      expectsPanel: true,
      panelClaim: { amount: 70, receivedAmount: 0, status: 'approved' },
    });

    expect(sumPatientCollectibleBalance([ledger])).toBe(15);
  });

  it('classifies a historical panel invoice from its durable queue payer context', () => {
    const data = buildReceiptData({
      payment: {
        id: 'payment-panel-copay', batch_id: 'batch-mixed', amount: 10,
        payment_method: 'cash', payment_type: 'panel', created_at: '2026-08-13T08:00:00Z',
        queue_entry_id: 'queue-panel', consultation_id: 'consultation-panel', deleted_at: null,
      },
      receipt_id: 'batch-mixed',
      selected_queue_entry_ids: ['queue-panel'],
      payments: [{
        id: 'payment-panel-copay', batch_id: 'batch-mixed', amount: 10,
        payment_method: 'cash', payment_type: 'panel', created_at: '2026-08-13T08:00:00Z',
        queue_entry_id: 'queue-panel', consultation_id: 'consultation-panel', deleted_at: null,
      }],
      ledger_payments: [{
        id: 'later-self-pay-copy', batch_id: null, amount: 10,
        payment_method: 'cash', payment_type: 'self_pay', created_at: '2026-08-14T08:00:00Z',
        queue_entry_id: 'queue-panel', consultation_id: 'consultation-panel', deleted_at: null,
      }],
      queue_entries: [{
        id: 'queue-panel', queue_sequence: 7, created_at: '2026-08-01T08:00:00Z',
        payment_method: 'panel', panel_id: 'provider-inactive', panel_provider_name: 'Legacy Panel',
        patient: { name: 'Aminah', national_id: null, date_of_birth: null },
      }],
      consultations: [{ id: 'consultation-panel', queue_entry_id: 'queue-panel' }],
      items: [{ consultation_id: 'consultation-panel', item_name: 'Consultation', quantity: 1, price: 100 }],
      panel_claims: [{
        queue_entry_id: 'queue-panel', amount: 70, received_amount: 0, status: 'pending',
      }],
    } satisfies PaymentBatchReceiptSnapshot);

    expect(data).toMatchObject({ paymentType: 'panel', panelBilled: 70, balanceRemaining: 20 });
  });

  it('never falls back to a voided clicked tender when building a receipt', () => {
    const clicked = {
      id: 'voided-click', batch_id: 'batch-1', amount: 25, payment_method: 'cash',
      payment_type: 'self_pay', created_at: '2026-08-13T08:00:00Z',
      queue_entry_id: 'queue-a', consultation_id: 'consultation-a',
      deleted_at: '2026-08-14T08:00:00Z',
    };
    const snapshot = {
      payment: clicked,
      receipt_id: 'batch-1',
      selected_queue_entry_ids: ['queue-a'],
      payments: [clicked],
      ledger_payments: [],
      queue_entries: [], consultations: [], items: [], panel_claims: [],
    } satisfies PaymentBatchReceiptSnapshot;

    expect(buildReceiptData(snapshot)).toBeNull();
  });

  it('explains that print and download are unavailable for a voided payment', () => {
    expect(receiptErrorMessage(new Error('PAYMENT_VOIDED')))
      .toBe('Payment voided — receipt unavailable.');
  });
});
