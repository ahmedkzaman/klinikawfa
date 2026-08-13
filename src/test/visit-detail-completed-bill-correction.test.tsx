import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'ops_staff' as string | null }));
const corrected = vi.hoisted(() => ({ value: false }));
const visit = vi.hoisted(() => ({
  queueStatus: 'completed',
  consultationStatus: 'completed',
  caseNote: null as string | null,
}));
const history = vi.hoisted(() => ({
  data: [] as Array<{ id: string; actorId: string; createdAt: string; reason: string; beforeTotal: number; afterTotal: number }>,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const historyHook = vi.hoisted(() => vi.fn());
const refetchConsultation = vi.hoisted(() => vi.fn());
const refetchItems = vi.hoisted(() => vi.fn());
const refetchPayments = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ queueEntryId: 'queue-1' }) };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useQueueEntry: () => ({
    data: {
      id: 'queue-1', clinic_status: visit.queueStatus, created_at: '2026-07-28T09:00:00.000Z', queue_sequence: 1,
      patients: { name: 'Aminah', date_of_birth: null, national_id: null, phone: null, gender: null },
      doctors: null,
    },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({
    data: {
      id: 'consultation-1',
      status: visit.consultationStatus,
      diagnosis_text: null,
      case_note: visit.caseNote,
    },
    refetch: refetchConsultation,
  }),
}));
vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => ({
    data: corrected.value
      ? [{ id: 'item-1', item_name: 'Consultation', quantity: 1, price: 75 }]
      : [{ id: 'item-1', item_name: 'Consultation', quantity: 1, price: 50 }],
    refetch: refetchItems,
  }),
}));
vi.mock('@/hooks/clinic/usePayments', () => ({
  usePayments: () => ({
    data: corrected.value
      ? [{ id: 'payment-1', amount: 75, payment_method: 'cash', payment_type: 'self_pay', created_at: '2026-07-28T09:00:00.000Z' }]
      : [{ id: 'payment-1', amount: 50, payment_method: 'cash', payment_type: 'self_pay', created_at: '2026-07-28T09:00:00.000Z' }],
    refetch: refetchPayments,
  }),
}));
vi.mock('@/hooks/clinic/useVisitPanelClaim', () => ({
  useVisitPanelClaim: () => ({ data: null, refetch: vi.fn() }),
}));
vi.mock('@/components/clinic/StatusBadge', () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock('@/components/clinic/visit/VisitDetailsColumn', () => ({ VisitDetailsColumn: () => null }));
vi.mock('@/components/clinic/visit/AttachmentsCard', () => ({ AttachmentsCard: () => null }));
vi.mock('@/components/clinic/patient/PatientVisitPaymentHistory', () => ({ PatientVisitPaymentHistory: () => null }));
vi.mock('@/components/clinic/visit/BillingDetailsColumn', () => ({
  BillingDetailsColumn: ({ items, payments }: { items: Array<{ price: number; quantity: number }>; payments: Array<{ amount: number }> }) => (
    <section aria-label="Billing">
      <p>Items total: RM {items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}</p>
      <p>Payments total: RM {payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)}</p>
    </section>
  ),
}));
vi.mock('@/components/clinic/visit/CompletedBillCorrectionDialog', () => ({
  CompletedBillCorrectionDialog: ({ open, onOpenChange, onCorrected }: { open: boolean; onOpenChange: (open: boolean) => void; onCorrected?: () => void }) => open ? (
    <div role="dialog">
      <button onClick={() => { corrected.value = true; onCorrected?.(); onOpenChange(false); }}>Apply correction</button>
    </div>
  ) : null,
}));
vi.mock('@/hooks/clinic/useCompletedBillCorrection', () => ({
  useCompletedBillCorrectionHistory: (queueEntryId: string | null) => {
    historyHook(queueEntryId);
    return history;
  },
}));

import VisitDetail from '@/pages/clinic/VisitDetail';

function renderVisit() {
  return render(<MemoryRouter><VisitDetail /></MemoryRouter>);
}

describe('completed visit bill correction', () => {
  beforeEach(() => {
    auth.role = 'ops_staff';
    corrected.value = false;
    visit.queueStatus = 'completed';
    visit.consultationStatus = 'completed';
    visit.caseNote = null;
    history.data = [];
    history.isLoading = false;
    history.isError = false;
    history.refetch.mockReset();
    historyHook.mockReset();
    refetchConsultation.mockReset();
    refetchItems.mockReset();
    refetchPayments.mockReset();
  });

  it.each([
    'ops_staff', 'operations', 'staff', 'purchaser', 'staff_nurse',
    'admin', 'special_admin', 'doctor_admin',
  ])(
    'shows Edit completed bill to %s',
    (role) => {
      auth.role = role;
      renderVisit();
      expect(screen.getByRole('button', { name: 'Edit completed bill' })).toBeVisible();
    },
  );

  it.each(['locum', 'resident_doctor', 'guest'])(
    'hides completed bill correction from %s',
    (role) => {
      auth.role = role;
      renderVisit();
      expect(screen.queryByRole('button', { name: 'Edit completed bill' })).not.toBeInTheDocument();
    },
  );

  it('hides completed bill correction for a non-completed queue even for an allowed role', () => {
    visit.queueStatus = 'with_doctor';
    renderVisit();
    expect(screen.queryByRole('button', { name: 'Edit completed bill' })).not.toBeInTheDocument();
  });

  it('hides completed bill correction for a non-completed consultation even for an allowed role', () => {
    visit.consultationStatus = 'with_doctor';
    renderVisit();
    expect(screen.queryByRole('button', { name: 'Edit completed bill' })).not.toBeInTheDocument();
  });

  it('shows completed bill correction for a legacy completed direct-sale OTC consultation', () => {
    visit.consultationStatus = 'in_progress';
    visit.caseNote = 'Direct Sale (OTC counter sale)';

    renderVisit();

    expect(screen.getByRole('button', { name: 'Edit completed bill' })).toBeVisible();
  });

  it('refreshes corrected billing values without changing completed status badges', async () => {
    renderVisit();
    expect(screen.getByText('Items total: RM 50.00')).toBeVisible();
    expect(screen.getByText('Payments total: RM 50.00')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Edit completed bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply correction' }));

    await waitFor(() => expect(refetchItems).toHaveBeenCalledTimes(1));
    expect(refetchConsultation).toHaveBeenCalledTimes(1);
    expect(refetchPayments).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Items total: RM 75.00')).toBeVisible();
    expect(screen.getByText('Payments total: RM 75.00')).toBeVisible();
    expect(screen.getAllByText('completed')).toHaveLength(2);
  });

  it.each([
    'ops_staff', 'operations', 'staff', 'purchaser', 'staff_nurse',
    'admin', 'special_admin', 'doctor_admin',
  ])(
    'shows immutable financial correction history to %s',
    (role) => {
    auth.role = role;
    history.data = [{
      id: 'audit-1', actorId: 'actor-1', createdAt: '2026-07-28T09:15:00.000Z', reason: 'Correct consultation fee', beforeTotal: 50, afterTotal: 75,
    }];
    renderVisit();
    expect(screen.getByRole('heading', { name: 'Bill correction history' })).toBeVisible();
    expect(screen.getByText('Correct consultation fee')).toBeVisible();
    expect(screen.getByText('RM 50.00 → RM 75.00')).toBeVisible();
    expect(screen.getByText('Actor: actor-1')).toBeVisible();
    expect(historyHook).toHaveBeenCalledWith('queue-1');
  });

  it('does not request or show correction history to a correction-denied role', () => {
    auth.role = 'locum';
    history.data = [{
      id: 'audit-1', actorId: 'actor-1', createdAt: '2026-07-28T09:15:00.000Z', reason: 'Correct consultation fee', beforeTotal: 50, afterTotal: 75,
    }];
    renderVisit();
    expect(screen.queryByRole('heading', { name: 'Bill correction history' })).not.toBeInTheDocument();
    expect(historyHook).toHaveBeenCalledWith(null);
  });
});
