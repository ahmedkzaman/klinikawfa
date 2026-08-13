import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadReceiptPdf, printReceipt } from '@/lib/clinic/printReceipt';

const { calculateDualLedgerSpy } = vi.hoisted(() => ({
  calculateDualLedgerSpy: vi.fn(),
}));

const clickedPayment = {
  id: 'payment-qr-60',
  payment_method: 'qr_pay',
  payment_type: 'self_pay',
  amount: 60,
  batch_id: 'batch-first',
  created_at: '2026-08-12T09:01:00.000Z',
  queue_entry_id: 'queue-split',
  consultation_id: 'consultation-split',
  queue_entries: {
    queue_sequence: 1,
    created_at: '2026-08-12T09:00:00.000Z',
    patients: { name: 'Aminah', national_id: null, date_of_birth: null },
  },
};

const ledgerRows = [
  {
    id: 'self-cash-40',
    amount: 40,
    payment_method: 'cash',
    payment_type: 'self_pay',
    created_at: '2026-08-12T09:00:00.000Z',
    queue_entries: {
      id: 'queue-self',
      created_at: '2026-08-12T09:00:00.000Z',
      queue_sequence: 1,
      patient_id: 'patient-self',
      clinic_status: 'completed',
      patients: { name: 'Self Pay Patient' },
      insurance_providers: null,
    },
  },
  {
    id: 'self-qr-60',
    amount: 60,
    payment_method: 'qr_pay',
    payment_type: 'self_pay',
    created_at: '2026-08-12T09:01:00.000Z',
    queue_entries: {
      id: 'queue-self',
      created_at: '2026-08-12T09:00:00.000Z',
      queue_sequence: 1,
      patient_id: 'patient-self',
      clinic_status: 'completed',
      patients: { name: 'Self Pay Patient' },
      insurance_providers: null,
    },
  },
  {
    id: 'panel-cash-40',
    amount: 40,
    payment_method: 'cash',
    payment_type: 'panel',
    created_at: '2026-08-12T10:00:00.000Z',
    queue_entries: {
      id: 'queue-panel',
      created_at: '2026-08-12T10:00:00.000Z',
      queue_sequence: 2,
      patient_id: 'patient-panel',
      clinic_status: 'completed',
      patients: { name: 'Panel Patient' },
      insurance_providers: { name: 'AIA' },
    },
  },
  {
    id: 'panel-qr-60',
    amount: 60,
    payment_method: 'qr_pay',
    payment_type: 'panel',
    created_at: '2026-08-12T10:01:00.000Z',
    queue_entries: {
      id: 'queue-panel',
      created_at: '2026-08-12T10:00:00.000Z',
      queue_sequence: 2,
      patient_id: 'patient-panel',
      clinic_status: 'completed',
      patients: { name: 'Panel Patient' },
      insurance_providers: { name: 'AIA' },
    },
  },
];

vi.mock('@/hooks/clinic/usePayments', () => ({
  usePaymentsLedger: () => ({ data: ledgerRows, isLoading: false }),
}));

vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({ settings: { clinic_name: 'Klinik Awfa' } }),
}));

vi.mock('@/lib/clinic/printReceipt', () => ({
  downloadReceiptPdf: vi.fn(),
  printReceipt: vi.fn(),
}));

vi.mock('@/lib/clinic/dualLedger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/clinic/dualLedger')>(
    '@/lib/clinic/dualLedger',
  );
  calculateDualLedgerSpy.mockImplementation(actual.calculateDualLedger);
  return { ...actual, calculateDualLedger: calculateDualLedgerSpy };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => table === 'panel_claims'
          ? Promise.resolve({ data: [], error: null })
          : chain,
        is: () => {
          if (table === 'payments') {
            return Promise.resolve({
              data: [
                { id: 'cash-40', batch_id: 'batch-first', amount: 40, payment_method: 'cash', created_at: '2026-08-12T09:00:00Z' },
                { id: 'qr-60', batch_id: 'batch-first', amount: 60, payment_method: 'qr_pay', created_at: '2026-08-12T09:01:00Z' },
                { id: 'panel-marker', batch_id: 'batch-first', amount: 0, payment_method: 'panel', created_at: '2026-08-12T09:02:00Z' },
                { id: 'later-card', batch_id: 'batch-later', amount: 20, payment_method: 'card', created_at: '2026-08-12T10:00:00Z' },
              ],
              error: null,
            });
          }
          if (table === 'consultations') {
            return Promise.resolve({ data: [], error: null });
          }
          return chain;
        },
        order: () => Promise.resolve({
          data: [{
            item_name: 'Consultation',
            quantity: 1,
            price: 100,
            item_id: null,
          }],
          error: null,
        }),
        maybeSingle: () => Promise.resolve({ data: clickedPayment, error: null }),
      };
      return chain;
    },
  },
}));

import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';
import Billings from '@/pages/clinic/Billings';
import { aggregateSalesInsights } from '@/lib/clinic/salesInsights';

describe('split payment reporting', () => {
  beforeEach(() => {
    calculateDualLedgerSpy.mockClear();
  });

  it('attributes every receipt payment portion to its own physical method', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(PrintReceiptDialog, {
          open: true,
          onOpenChange: vi.fn(),
          paymentId: clickedPayment.id,
        }),
      ),
    );

    expect(await screen.findByText('Invoice Total (RM)')).toBeVisible();
    expect(calculateDualLedgerSpy).toHaveBeenCalledWith(expect.objectContaining({
      patientPayments: [
        { amount: 40, paymentMethod: 'cash' },
        { amount: 60, paymentMethod: 'qr_pay' },
        { amount: 20, paymentMethod: 'card' },
      ],
    }));
    expect(screen.getByText('Cash')).toBeVisible();
    expect(screen.getByText('QR Pay')).toBeVisible();
    expect(screen.getByText('RM 40.00')).toBeVisible();
    expect(screen.queryByText('RM 20.00')).not.toBeInTheDocument();
    expect(screen.getByText('RM 60.00')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => {
      expect(printReceipt).toHaveBeenCalledWith(expect.objectContaining({
        amountPaid: 100,
        paymentPortions: expect.arrayContaining([
          expect.objectContaining({ method: 'cash', amount: 40 }),
          expect.objectContaining({ method: 'qr_pay', amount: 60 }),
        ]),
      }), expect.anything());
      expect(downloadReceiptPdf).toHaveBeenCalledWith(expect.objectContaining({ amountPaid: 100 }), expect.anything());
      expect(printReceipt).not.toHaveBeenCalledWith(expect.objectContaining({
        paymentPortions: expect.arrayContaining([expect.objectContaining({ method: 'panel' })]),
      }), expect.anything());
    });
  });

  it('renders combined self-pay methods while preserving the panel provider and copay label', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Billings />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Cash + QR Pay')).toBeVisible();
    expect(await screen.findByText('Panel: AIA + Copay')).toBeVisible();
  });

  it('allocates split rows to their actual Insight payment-method totals', () => {
    const result = aggregateSalesInsights([
      {
        id: 'cash-40',
        queue_entry_id: 'queue-split',
        consultation_id: 'consultation-split',
        payment_type: 'self_pay',
        payment_method: 'cash',
        amount: 40,
        created_at: '2026-08-12T09:00:00.000Z',
      },
      {
        id: 'qr-60',
        queue_entry_id: 'queue-split',
        consultation_id: 'consultation-split',
        payment_type: 'self_pay',
        payment_method: 'qr_pay',
        amount: 60,
        created_at: '2026-08-12T09:01:00.000Z',
      },
    ]);

    expect(result.byMethod).toEqual([
      { method: 'qr_pay', collected: 60, paymentCount: 1 },
      { method: 'cash', collected: 40, paymentCount: 1 },
    ]);
  });
});
