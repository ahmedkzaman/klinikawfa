import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelClaimPortions } from '@/components/clinic/claims/PanelClaimPortions';
import type { PanelClaimPortion } from '@/lib/clinic/panelClaimPortions';

const portionsQuery = vi.hoisted(() => ({
  current: {
    data: [] as PanelClaimPortion[] | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));
const authRole = vi.hoisted(() => ({ current: 'operations' }));
const mutations = vi.hoisted(() => ({
  update: vi.fn(),
  replace: vi.fn(),
  cancel: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ role: authRole.current }),
}));

vi.mock('@/hooks/clinic/usePanelClaims', () => ({
  useClaimTreatmentItems: () => ({ data: { visit_date: null, items: [] }, isLoading: false }),
  useUpdatePanelClaim: () => ({ mutateAsync: mutations.update, isPending: false }),
  usePanelClaimPortions: () => portionsQuery.current,
  useReplacePanelClaimPortions: () => ({ mutateAsync: mutations.replace, isPending: false }),
  useCancelPanelClaimPortions: () => ({ mutateAsync: mutations.cancel, isPending: false }),
  useRecordPanelClaimPortionPayment: () => ({ mutateAsync: mutations.record, isPending: false }),
  getClaimDocSignedUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: vi.fn() } } }));

import ClaimDetailsSheet from '@/components/clinic/claims/ClaimDetailsSheet';

const portions: PanelClaimPortion[] = [
  {
    id: 'portion-1',
    panel_claim_id: 'claim-1',
    portion_no: 1,
    amount: 120,
    received_amount: 40,
    status: 'partially_paid',
    payment_reference: 'EFT-001',
    received_date: '2026-08-04',
    remark: 'First remittance',
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
  },
  {
    id: 'portion-2',
    panel_claim_id: 'claim-1',
    portion_no: 2,
    amount: 80,
    received_amount: 0,
    status: 'unpaid',
    payment_reference: null,
    received_date: null,
    remark: 'Final approval',
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
  },
];

describe('PanelClaimPortions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows each portion ledger entry read-only to viewers', () => {
    render(
      <PanelClaimPortions
        portions={portions}
        canReceivePayments={false}
        onReceivePayment={vi.fn()}
      />,
    );

    expect(screen.getByText('Portion ledger')).toBeVisible();
    expect(screen.getByText('#1')).toBeVisible();
    expect(screen.getByText('#2')).toBeVisible();
    expect(screen.getByText('Partially paid')).toBeVisible();
    expect(screen.getByText('Unpaid')).toBeVisible();
    expect(screen.getByText('EFT-001')).toBeVisible();
    expect(screen.getByText('First remittance')).toBeVisible();
    expect(screen.getAllByText('RM 80.00')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Receive payment for portion 1' })).not.toBeInTheDocument();
  });

  it('requires payment evidence and limits the receipt to its outstanding balance', async () => {
    const onReceivePayment = vi.fn().mockResolvedValue(undefined);
    render(
      <PanelClaimPortions
        portions={portions}
        canReceivePayments
        onReceivePayment={onReceivePayment}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText('Payment reference is required.')).toBeVisible();

    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-002' } });
    fireEvent.change(screen.getByLabelText(/payment date/i), { target: { value: '2026-08-05' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText('Payment amount must not exceed RM 80.00.')).toBeVisible();

    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));

    await waitFor(() => expect(onReceivePayment).toHaveBeenCalledTimes(1));
    expect(onReceivePayment.mock.calls[0][0]).toMatchObject({
      portionId: 'portion-1',
      amount: 80,
      receivedDate: '2026-08-05',
      paymentReference: 'EFT-002',
    });
  });

  it('reuses one idempotency key when a receipt submission is retried after an RPC error', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000005');
    const onReceivePayment = vi.fn()
      .mockRejectedValueOnce(new Error('Receipt service unavailable'))
      .mockResolvedValueOnce(undefined);
    render(
      <PanelClaimPortions
        portions={portions}
        canReceivePayments
        onReceivePayment={onReceivePayment}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 2' }));
    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-003' } });
    fireEvent.change(screen.getByLabelText(/payment date/i), { target: { value: '2026-08-05' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));

    expect(await screen.findByText('Receipt service unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));

    await waitFor(() => expect(onReceivePayment).toHaveBeenCalledTimes(2));
    expect(onReceivePayment.mock.calls[0][0].idempotencyKey)
      .toBe(onReceivePayment.mock.calls[1][0].idempotencyKey);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid currency precision and exponent notation before submitting a receipt', () => {
    const onReceivePayment = vi.fn().mockResolvedValue(undefined);
    render(<PanelClaimPortions portions={portions} canReceivePayments onReceivePayment={onReceivePayment} />);

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 2' }));
    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-004' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80.001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText('Enter a positive amount with up to two decimal places.')).toBeVisible();

    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '1e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText('Enter a positive amount with up to two decimal places.')).toBeVisible();
    expect(onReceivePayment).not.toHaveBeenCalled();
  });

  it('uses a fresh idempotency key after the receipt dialog is reset', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000006')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000007');
    const onReceivePayment = vi.fn().mockRejectedValue(new Error('Try again'));
    render(<PanelClaimPortions portions={portions} canReceivePayments onReceivePayment={onReceivePayment} />);

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 2' }));
    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-005' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(await screen.findByText('Try again')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 2' }));
    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-006' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    await waitFor(() => expect(onReceivePayment).toHaveBeenCalledTimes(2));

    expect(onReceivePayment.mock.calls[0][0].idempotencyKey).not.toBe(onReceivePayment.mock.calls[1][0].idempotencyKey);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('uses the latest portion balance while its receipt dialog is open', () => {
    const onReceivePayment = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<PanelClaimPortions portions={portions} canReceivePayments onReceivePayment={onReceivePayment} />);

    fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 1' }));
    rerender(
      <PanelClaimPortions
        portions={[{ ...portions[0], received_amount: 70 }, portions[1]]}
        canReceivePayments
        onReceivePayment={onReceivePayment}
      />,
    );
    fireEvent.change(screen.getByLabelText(/payment reference/i), { target: { value: 'EFT-007' } });
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));

    expect(screen.getByText('Payment amount must not exceed RM 50.00.')).toBeVisible();
    expect(onReceivePayment).not.toHaveBeenCalled();
  });

  it('defaults receipt dates using the Kuala Lumpur calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T16:30:00.000Z'));
    try {
      render(<PanelClaimPortions portions={portions} canReceivePayments onReceivePayment={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Receive payment for portion 2' }));

      expect(screen.getByLabelText(/payment date/i)).toHaveValue('2026-08-05');
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters the ledger by unpaid, partially paid, and paid portions', () => {
    const paidPortion = {
      ...portions[1],
      id: 'portion-3',
      portion_no: 3,
      received_amount: 80,
      status: 'paid' as const,
    };
    render(
      <PanelClaimPortions
        portions={[...portions, paidPortion]}
        canReceivePayments={false}
        onReceivePayment={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Portion status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unpaid' }));
    expect(screen.getByText('#2')).toBeVisible();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    expect(screen.queryByText('#3')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Portion status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Partially paid' }));
    expect(screen.getByText('#1')).toBeVisible();
    expect(screen.queryByText('#2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Portion status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Paid' }));
    expect(screen.getByText('#3')).toBeVisible();
  });
});

describe('ClaimDetailsSheet split payment workflow', () => {
  const claim = {
    id: 'claim-1',
    claim_no: 'PC-001',
    amount: 200,
    received_amount: 40,
    status: 'approved' as const,
    claim_date: '2026-08-04',
    due_date: null,
    submitted_date: null,
    approved_amount: 200,
    write_off_amount: null,
    payment_reference: null,
    received_date: null,
    gl_document_url: null,
    remarks: 'Panel has approved the claim.',
    created_at: '2026-08-04T10:00:00.000Z',
    portions_version: 2,
    is_overdue: false,
    queue_entry_id: null,
    insurance_providers: { id: 'panel-1', name: 'Care Panel' },
    patients: { id: 'patient-1', name: 'Aminah', reg_no: 'P-001' },
    updater: null,
  };

  beforeEach(() => {
    portionsQuery.current = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
    authRole.current = 'operations';
    mutations.update.mockReset();
    mutations.replace.mockReset();
    mutations.cancel.mockReset();
    mutations.record.mockReset();
    mutations.update.mockResolvedValue(undefined);
    mutations.replace.mockResolvedValue(undefined);
    mutations.cancel.mockResolvedValue(undefined);
    mutations.record.mockResolvedValue(undefined);
  });

  it('keeps the existing parent receipt workflow for unsplit claims', () => {
    render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Total billed amount')).toBeVisible();
    expect(screen.queryByText('Portion ledger')).not.toBeInTheDocument();
  });

  it('keeps lifecycle, evidence, remarks, and save controls for a split claim while locking allocation after a receipt', async () => {
    portionsQuery.current = { data: portions, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Portion ledger')).toBeVisible();
    expect(screen.queryByLabelText(/payment reference/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Claim status' })).toBeVisible();
    expect(screen.getByPlaceholderText(/Notes for this status change/)).toHaveValue('Panel has approved the claim.');
    expect(screen.getByText('Guarantee Letter / Evidence')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(screen.getByText('Portion allocation is locked after a receipt.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit payment split' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Notes for this status change/), {
      target: { value: 'Approval evidence retained' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mutations.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'claim-1',
      status: 'approved',
      remarks: 'Approval evidence retained',
    })));
  });

  it('keeps purchaser portion receipts usable without granting parent lifecycle edits', () => {
    authRole.current = 'purchaser';
    portionsQuery.current = { data: portions, isLoading: false, isError: false, error: null, refetch: vi.fn() };

    render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Receive payment for portion 2' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Claim status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('fails closed while portions load or fail instead of exposing the unsplit workflow', () => {
    portionsQuery.current = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
    const { rerender } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Loading payment workflow…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Split payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();

    const refetch = vi.fn();
    portionsQuery.current = { data: undefined, isLoading: false, isError: true, error: new Error('Portions unavailable'), refetch };
    rerender(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Unable to load payment portions.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry portion loading' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
  });

  it('allows an authorized user to create an exact unpaid split and requires confirmation to cancel it', async () => {
    const { unmount } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Split payment' }));
    fireEvent.change(screen.getByLabelText('Portion 1 amount (RM)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Portion 2 amount (RM)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm portions' }));
    await waitFor(() => expect(mutations.replace).toHaveBeenCalledWith(expect.objectContaining({
      claimId: 'claim-1',
      portions: [{ amount: '100', remark: '' }, { amount: '100', remark: '' }],
      expectedVersion: 2,
    })));

    unmount();
    portionsQuery.current = { data: portions.map((portion) => ({ ...portion, received_amount: 0, status: 'unpaid' })), isLoading: false, isError: false, error: null, refetch: vi.fn() };
    render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel split' }));
    expect(screen.getByRole('heading', { name: 'Cancel this payment split?' })).toBeVisible();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel split' }));
    await waitFor(() => expect(mutations.cancel).toHaveBeenCalledWith({
      claimId: 'claim-1',
      reason: 'Split cancelled before receipt',
      expectedVersion: 2,
    }));
  });

  it.each(['rejected', 'cancelled'] as const)('does not offer split or receipt actions for a %s claim', (terminalStatus) => {
    portionsQuery.current = {
      data: portions.map((portion) => ({ ...portion, received_amount: 0, status: 'unpaid' as const })),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    render(
      <ClaimDetailsSheet
        claim={{ ...claim, status: terminalStatus, received_amount: 0 }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Receive payment for portion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit payment split' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel split' })).not.toBeInTheDocument();
  });

  it('does not expose split controls to a non-manager and closes a cancellation confirmation when receipts relock it', () => {
    authRole.current = 'staff';
    const { unmount } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Split payment' })).not.toBeInTheDocument();

    unmount();
    authRole.current = 'operations';
    portionsQuery.current = { data: portions.map((portion) => ({ ...portion, received_amount: 0, status: 'unpaid' })), isLoading: false, isError: false, error: null, refetch: vi.fn() };
    const { rerender } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel split' })[0]);
    expect(screen.getByRole('heading', { name: 'Cancel this payment split?' })).toBeVisible();

    portionsQuery.current = { data: portions, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    rerender(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: 'Cancel this payment split?' })).not.toBeInTheDocument();
  });
  it('preserves dirty fields and the portion editor across a same-id refresh while synchronizing receipt totals', () => {
    const { rerender } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Notes for this status change/), { target: { value: 'Draft local note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Split payment' }));
    fireEvent.change(screen.getByLabelText('Portion 1 amount (RM)'), { target: { value: '90' } });

    rerender(
      <ClaimDetailsSheet
        claim={{ ...claim, remarks: 'Background server note' }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Draft local note')).toBeVisible();
    expect(screen.getByLabelText('Portion 1 amount (RM)')).toHaveValue(90);

    rerender(
      <ClaimDetailsSheet
        claim={{ ...claim, status: 'received', received_amount: 120, remarks: 'Background server note' }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Draft local note')).toBeVisible();
    expect(screen.getByDisplayValue(120)).toBeVisible();
    expect(screen.getByText('Received')).toBeVisible();
  });

  it('synchronizes a same-id status refresh without replacing dirty fields', () => {
    const { rerender } = render(<ClaimDetailsSheet claim={claim} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Notes for this status change/), { target: { value: 'Draft status note' } });

    rerender(
      <ClaimDetailsSheet
        claim={{ ...claim, status: 'submitted', submitted_date: '2026-08-04' }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Draft status note')).toBeVisible();
    expect(screen.getByText('Submitted Date *')).toBeVisible();
  });
});
