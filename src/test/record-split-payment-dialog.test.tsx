import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  recordSplit: vi.fn(),
  recordSplitAndComplete: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => state.navigate };
});

vi.mock('@/hooks/clinic/useInsuranceProviders', () => ({
  useInsuranceProviders: () => ({
    data: [{ id: 'panel-1', name: 'Care Panel', panel_code: 'CARE' }],
  }),
}));

vi.mock('@/hooks/clinic/usePayments', () => ({
  useRecordPayment: () => ({ mutateAsync: state.recordSplit, isPending: false }),
  useRecordPaymentAndCompleteVisit: () => ({
    mutateAsync: state.recordSplitAndComplete,
    isPending: false,
  }),
  useRecordSplitPayments: () => ({ mutateAsync: state.recordSplit, isPending: false }),
  useRecordSplitPaymentsAndCompleteVisit: () => ({
    mutateAsync: state.recordSplitAndComplete,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: state.toastError, success: state.toastSuccess },
}));

import { RecordPaymentDialog } from '@/components/clinic/visit/RecordPaymentDialog';

function renderDialog({
  completeVisitOnPayment = true,
  defaultAmount = 100,
  storedPanelProvider,
  onOpenChange = vi.fn(),
  onRefreshBalance,
}: {
  completeVisitOnPayment?: boolean;
  defaultAmount?: number;
  storedPanelProvider?: { id: string; name: string } | null;
  onOpenChange?: (open: boolean) => void;
  onRefreshBalance?: () => Promise<unknown>;
} = {}) {
  const view = render(
    <RecordPaymentDialog
      open
      onOpenChange={onOpenChange}
      queueEntryId="queue-1"
      consultationId="consultation-1"
      defaultAmount={defaultAmount}
      completeVisitOnPayment={completeVisitOnPayment}
      storedPanelProvider={storedPanelProvider}
      onRefreshBalance={onRefreshBalance}
    />,
  );
  return { onOpenChange, ...view };
}

function addSecondAllocation(firstAmount = '40') {
  fireEvent.change(screen.getByLabelText('Amount (RM)'), {
    target: { value: firstAmount },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add payment method' }));
}

function chooseSecondMethod(optionName = 'QR Pay / E-Wallet') {
  fireEvent.click(screen.getByLabelText('Payment method 2'));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

function choosePanel() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Panel' }));
  fireEvent.click(screen.getByRole('option', { name: /Care Panel/ }));
}

describe('RecordPaymentDialog split allocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    state.recordSplit.mockResolvedValue({ payment_ids: ['payment-1'] });
    state.recordSplitAndComplete.mockResolvedValue({ payment_ids: ['payment-1'] });
  });

  it('defaults a new row to the exact remainder and recalculates after removal', () => {
    renderDialog();

    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
    addSecondAllocation('40');

    expect(screen.getByDisplayValue('60.00')).toBeInTheDocument();
    expect(screen.getByText('Allocated RM100.00 / Remaining RM0.00')).toBeVisible();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(screen.getByText('Allocated RM40.00 / Remaining RM60.00')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('prevents selecting a payment method already used by another row', () => {
    renderDialog();
    addSecondAllocation();

    fireEvent.click(screen.getByLabelText('Payment method 2'));

    expect(screen.getByRole('option', { name: 'Cash' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks an under-allocated active checkout', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '90' } });

    expect(screen.getByText('Allocate the remaining RM10.00.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record Payment & Check Out' })).toBeDisabled();
  });

  it('blocks an over-allocation', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '110' } });

    expect(screen.getByText('Allocated amount exceeds the balance by RM10.00.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record Payment & Check Out' })).toBeDisabled();
  });

  it('submits the exact panel co-payment total through physical methods', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Panel' }));

    expect(screen.getByText('Co-payment methods')).toBeVisible();
    expect(screen.getByLabelText('Amount (RM)')).toHaveValue(0);

    choosePanel();
    addSecondAllocation('20');
    fireEvent.change(screen.getByLabelText('Amount 2 (RM)'), { target: { value: '10' } });
    chooseSecondMethod();
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));

    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    expect(state.recordSplitAndComplete).toHaveBeenCalledWith(expect.objectContaining({
      payment_type: 'panel',
      expected_patient_amount: 30,
      provider_id: 'panel-1',
      payments: [
        { method: 'cash', amount: 20 },
        { method: 'qr_pay', amount: 10 },
      ],
      idempotency_key: expect.any(String),
    }));
  });

  it('submits a zero-payment panel checkout with no physical allocation rows', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Panel' }));
    choosePanel();

    expect(screen.getByRole('combobox', { name: 'Panel' })).toHaveTextContent('Care Panel');
    const submit = screen.getByRole('button', { name: 'Record Payment & Check Out' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    expect(state.recordSplitAndComplete).toHaveBeenCalledWith(expect.objectContaining({
      payment_type: 'panel',
      expected_patient_amount: 0,
      provider_id: 'panel-1',
      payments: [],
    }));
  });

  it('preserves allocation rows and the idempotency token after a failed retryable checkout', async () => {
    state.recordSplitAndComplete
      .mockRejectedValueOnce(new Error('Connection closed after commit'))
      .mockResolvedValueOnce({ payment_ids: ['payment-1', 'payment-2'] });
    const { onOpenChange } = renderDialog();
    addSecondAllocation();
    chooseSecondMethod();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));

    expect(screen.getByLabelText('Amount (RM)')).toHaveValue(40);
    expect(screen.getByLabelText('Amount 2 (RM)')).toHaveValue(60);
    expect(screen.getByLabelText('Payment method 2')).toHaveTextContent('QR Pay / E-Wallet');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(2));

    expect(state.recordSplitAndComplete.mock.calls[1][0].idempotency_key)
      .toBe(state.recordSplitAndComplete.mock.calls[0][0].idempotency_key);
  });

  it('restores the same attempted rows and idempotency key after close and reopen', async () => {
    state.recordSplitAndComplete
      .mockRejectedValueOnce(new Error('Connection closed after commit'))
      .mockResolvedValueOnce({ payment_ids: ['payment-1', 'payment-2'] });
    const { onOpenChange, rerender } = renderDialog();
    addSecondAllocation();
    chooseSecondMethod();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    const firstRequest = state.recordSplitAndComplete.mock.calls[0][0];

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <RecordPaymentDialog
        open={false}
        onOpenChange={onOpenChange}
        queueEntryId="queue-1"
        consultationId="consultation-1"
        defaultAmount={100}
        completeVisitOnPayment
      />,
    );
    rerender(
      <RecordPaymentDialog
        open
        onOpenChange={onOpenChange}
        queueEntryId="queue-1"
        consultationId="consultation-1"
        defaultAmount={100}
        completeVisitOnPayment
      />,
    );

    expect(screen.getByLabelText('Amount (RM)')).toHaveValue(40);
    expect(screen.getByLabelText('Amount 2 (RM)')).toHaveValue(60);
    expect(screen.getByLabelText('Payment method 2')).toHaveTextContent('QR Pay / E-Wallet');
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(2));
    expect(state.recordSplitAndComplete.mock.calls[1][0]).toEqual(firstRequest);
  });

  it('starts a new idempotency request only through an explicit refreshed-balance action', async () => {
    state.recordSplitAndComplete
      .mockRejectedValueOnce(new Error('Connection closed after commit'))
      .mockResolvedValueOnce({ payment_ids: ['payment-new'] });
    const onRefreshBalance = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onRefreshBalance });

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    const firstKey = state.recordSplitAndComplete.mock.calls[0][0].idempotency_key;

    fireEvent.click(screen.getByRole('button', { name: 'Start new payment' }));
    await waitFor(() => expect(onRefreshBalance).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(2));
    expect(state.recordSplitAndComplete.mock.calls[1][0].idempotency_key).not.toBe(firstKey);
  });

  it('does not offer to discard an ambiguous request without an authoritative refresh', async () => {
    state.recordSplitAndComplete.mockRejectedValueOnce(new Error('Connection closed after commit'));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('alert')).toHaveTextContent(/may already have reached the server/i);
    expect(screen.queryByRole('button', { name: 'Start new payment' })).not.toBeInTheDocument();
  });

  it('does not rotate the idempotency key by changing payment type after an ambiguous failure', async () => {
    state.recordSplitAndComplete
      .mockRejectedValueOnce(new Error('Connection closed after commit'))
      .mockResolvedValueOnce({ payment_ids: ['payment-1'] });
    renderDialog({ onRefreshBalance: vi.fn().mockResolvedValue(undefined) });

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    const firstRequest = state.recordSplitAndComplete.mock.calls[0][0];

    expect(screen.getByRole('radio', { name: 'Self-pay' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Panel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Panel' }));
    expect(screen.getByRole('radio', { name: 'Self-pay' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(2));
    expect(state.recordSplitAndComplete.mock.calls[1][0]).toEqual(firstRequest);
  });

  it('keeps the failed request stable when live props change while the dialog stays open', async () => {
    state.recordSplitAndComplete
      .mockRejectedValueOnce(new Error('Connection closed after commit'))
      .mockResolvedValueOnce({ payment_ids: ['payment-1', 'payment-2'] });
    const { onOpenChange, rerender } = renderDialog();
    addSecondAllocation();
    chooseSecondMethod();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(1));
    const firstRequest = state.recordSplitAndComplete.mock.calls[0][0];

    rerender(
      <RecordPaymentDialog
        open
        onOpenChange={onOpenChange}
        queueEntryId="queue-1"
        consultationId="consultation-1"
        defaultAmount={150}
        defaultPaymentMethod="card"
        completeVisitOnPayment
      />,
    );

    expect(screen.getByLabelText('Amount (RM)')).toHaveValue(40);
    expect(screen.getByLabelText('Amount 2 (RM)')).toHaveValue(60);
    expect(screen.getByLabelText('Payment method')).toHaveTextContent('Cash');
    expect(screen.getByLabelText('Payment method 2')).toHaveTextContent('QR Pay / E-Wallet');
    expect(screen.getByText('Allocated RM100.00 / Remaining RM0.00')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment & Check Out' }));
    await waitFor(() => expect(state.recordSplitAndComplete).toHaveBeenCalledTimes(2));
    expect(state.recordSplitAndComplete.mock.calls[1][0]).toEqual(firstRequest);
  });

  it('normalizes fractional sen consistently before validation and submission', async () => {
    renderDialog({ completeVisitOnPayment: false });
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '2.675' } });

    expect(screen.getByText('Allocated RM2.68 / Remaining RM97.32')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(state.recordSplit).toHaveBeenCalledTimes(1));
    expect(state.recordSplit).toHaveBeenCalledWith(expect.objectContaining({
      expected_patient_amount: 2.68,
      payments: [{ method: 'cash', amount: 2.68 }],
    }));
  });

  it('allows a partial collection on an already-completed visit', async () => {
    renderDialog({ completeVisitOnPayment: false });
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(state.recordSplit).toHaveBeenCalledTimes(1));
    expect(state.recordSplit).toHaveBeenCalledWith(expect.objectContaining({
      expected_patient_amount: 40,
      payments: [{ method: 'cash', amount: 40 }],
    }));
    expect(state.recordSplitAndComplete).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.toastSuccess).toHaveBeenCalledWith('Payment recorded');
  });

  it('makes completed panel patient collection reachable independently of panel outstanding', async () => {
    renderDialog({
      completeVisitOnPayment: false,
      defaultAmount: 0,
      storedPanelProvider: { id: 'panel-1', name: 'Care Panel' },
    });
    fireEvent.change(screen.getByLabelText('Patient collection amount (RM)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(state.recordSplit).toHaveBeenCalledWith(expect.objectContaining({
      payment_type: 'panel', expected_patient_amount: 30,
    })));
  });

  it('updates the completed panel collection target after a stale-balance rejection', async () => {
    state.recordSplit.mockRejectedValueOnce(
      new Error('STALE_PATIENT_OUTSTANDING: expected 18.50'),
    );
    renderDialog({
      completeVisitOnPayment: false,
      defaultAmount: 0,
      storedPanelProvider: { id: 'panel-1', name: 'Care Panel' },
    });
    fireEvent.change(screen.getByLabelText('Patient collection amount (RM)'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(state.recordSplit).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Patient collection amount (RM)')).toHaveValue(18.5);
    expect(screen.getByText('Allocated amount exceeds the balance by RM11.50.')).toBeVisible();
  });

  it('uses the completed visit stored provider read-only even when it is inactive', async () => {
    renderDialog({
      completeVisitOnPayment: false,
      defaultAmount: 30,
      storedPanelProvider: { id: 'inactive-panel', name: 'Archived Employer Panel' },
    });
    expect(screen.getByText('Archived Employer Panel')).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Self-pay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Panel' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Patient collection amount (RM)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Amount (RM)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(state.recordSplit).toHaveBeenCalledWith(expect.objectContaining({
      payment_type: 'panel', provider_id: 'inactive-panel',
    })));
  });
});
