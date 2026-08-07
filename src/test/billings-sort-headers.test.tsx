import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const ledgerRows = vi.hoisted(() => [
  {
    id: 'payment-old',
    amount: 60,
    payment_method: 'cash',
    payment_type: 'self_pay',
    created_at: '2026-08-01T10:30:00.000Z',
    queue_entries: {
      id: 'queue-old',
      created_at: '2026-08-01T10:00:00.000Z',
      queue_sequence: 1,
      patient_id: 'patient-old',
      clinic_status: 'completed',
      patients: { name: 'Old Patient' },
    },
  },
  {
    id: 'payment-new',
    amount: 20,
    payment_method: 'card',
    payment_type: 'self_pay',
    created_at: '2026-08-03T10:30:00.000Z',
    queue_entries: {
      id: 'queue-new',
      created_at: '2026-08-03T10:00:00.000Z',
      queue_sequence: 2,
      patient_id: 'patient-new',
      clinic_status: 'completed',
      patients: { name: 'New Patient' },
    },
  },
  {
    id: 'payment-mid',
    amount: 100,
    payment_method: 'qr_pay',
    payment_type: 'self_pay',
    created_at: '2026-08-02T10:30:00.000Z',
    queue_entries: {
      id: 'queue-mid',
      created_at: '2026-08-02T10:00:00.000Z',
      queue_sequence: 3,
      patient_id: 'patient-mid',
      clinic_status: 'completed',
      patients: { name: 'Mid Patient' },
    },
  },
]);

vi.mock('@/hooks/clinic/usePayments', () => ({
  usePaymentsLedger: () => ({ data: ledgerRows, isLoading: false }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQuery: () => ({
      data: { 'queue-old': 60, 'queue-new': 20, 'queue-mid': 100 },
      isLoading: false,
    }),
  };
});

vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({
  PrintReceiptDialog: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import Billings from '@/pages/clinic/Billings';

function renderBillings() {
  return render(
    <MemoryRouter>
      <Billings />
    </MemoryRouter>,
  );
}

function patientOrder() {
  const rows = screen.getAllByText(/Patient$/).filter((node) => node.textContent !== 'PATIENT');
  return rows.map((node) => node.textContent);
}

describe('Billings sortable headers', () => {
  it('sorts visible billing rows from the header controls', () => {
    renderBillings();
    const header = within(screen.getByTestId('billing-ledger-header'));

    expect(patientOrder()).toEqual(['New Patient', 'Mid Patient', 'Old Patient']);
    expect(header.getByRole('button', { name: /Date/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    fireEvent.click(header.getByRole('button', { name: /Subtotal/i }));
    expect(patientOrder()).toEqual(['New Patient', 'Old Patient', 'Mid Patient']);
    expect(header.getByRole('button', { name: /Subtotal/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    fireEvent.click(header.getByRole('button', { name: /Subtotal/i }));
    expect(patientOrder()).toEqual(['Mid Patient', 'Old Patient', 'New Patient']);
    expect(header.getByRole('button', { name: /Subtotal/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    expect(header.getByRole('button', { name: /Paid/i })).toBeVisible();
    expect(header.getByRole('button', { name: /Outstanding/i })).toBeVisible();
    expect(header.getByRole('button', { name: /Method/i })).toBeVisible();
    expect(header.queryByRole('button', { name: /^Queue/i })).not.toBeInTheDocument();
    expect(header.queryByRole('button', { name: /^Patient/i })).not.toBeInTheDocument();
  });
});
