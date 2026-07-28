import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contextHook = vi.hoisted(() => vi.fn());
const correctBillHook = vi.hoisted(() => vi.fn());
const chargeTypesHook = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useCompletedBillCorrection', () => ({
  useCompletedBillCorrectionContext: contextHook,
  useCorrectCompletedBill: correctBillHook,
}));

vi.mock('@/hooks/clinic/useClinicChargeTypes', () => ({
  useClinicChargeTypes: chargeTypesHook,
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));

import { CompletedBillCorrectionDialog } from '@/components/clinic/visit/CompletedBillCorrectionDialog';

const context = {
  queueEntryId: 'queue-1',
  consultationId: 'consultation-1',
  fingerprint: 'fingerprint-1',
  items: [
    {
      id: 'item-1', itemName: 'Consultation', quantity: 1, price: 50,
      itemId: null, serviceId: 'service-1', packageId: null,
      dispensedQty: null, adjustmentKind: null, chargeTypeId: null, remove: false,
    },
    {
      id: 'medicine-1', itemName: 'Medicine', quantity: 3, price: 10,
      itemId: 'catalog-1', serviceId: null, packageId: null,
      dispensedQty: 2, adjustmentKind: null, chargeTypeId: null, remove: false,
    },
  ],
  payments: [{ id: 'payment-1', amount: 40, paymentMethod: 'cash', paymentType: 'self_pay' }],
  originalTotals: {
    subtotal: 80, discountRm: 0, taxRm: 0, taxPct: 0, total: 80,
    paid: 40, outstanding: 40, creditDue: 0, status: 'outstanding' as const,
  },
  panelClaim: { id: 'claim-1', status: 'approved', amount: 30, receivedAmount: 35 },
};

function renderDialog(onOpenChange = vi.fn(), onCorrected?: () => void | Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return {
    onOpenChange,
    ...render(
      <CompletedBillCorrectionDialog queueEntryId="queue-1" open onOpenChange={onOpenChange} onCorrected={onCorrected} />,
      { wrapper: Wrapper },
    ),
  };
}

describe('CompletedBillCorrectionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextHook.mockReturnValue({ data: context, isLoading: false, isError: false, refetch: vi.fn() });
    correctBillHook.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    chargeTypesHook.mockReturnValue({
      data: [{ id: 'charge-1', name: 'Administrative fee', default_amount: 5, is_active: true }],
    });
  });

  it('renders the completed-bill correction form with labelled financial controls', async () => {
    renderDialog();

    expect(await screen.findByRole('heading', { name: 'Correct completed bill' })).toHaveFocus();
    expect(screen.getByText('This changes a completed financial record.')).toBeVisible();
    expect(screen.getByLabelText('Consultation quantity')).toHaveValue(1);
    expect(screen.getByLabelText('Consultation price (RM)')).toHaveValue(50);
    expect(screen.getByLabelText('Add other charge')).toBeVisible();
    expect(screen.getByLabelText('Payment 1 amount (RM)')).toHaveValue(40);
    expect(screen.getByLabelText('Payment 1 method')).toHaveTextContent('Cash');
    expect(screen.getByLabelText('Discount (RM)')).toHaveValue(0);
    expect(screen.getByLabelText('Tax (%)')).toHaveValue(0);
    expect(screen.getByLabelText('Correction reason')).toBeRequired();
    expect(screen.getByText('Original total: RM 80.00')).toBeVisible();
    expect(screen.getByText('Corrected total: RM 80.00')).toBeVisible();
    expect(screen.getByText('Paid: RM 40.00')).toBeVisible();
    expect(screen.getByText('Outstanding: RM 40.00')).toBeVisible();
    expect(screen.getByText('Panel claim reconciliation')).toBeVisible();
    expect(screen.getByText('Panel credit due: RM 5.00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm correction' })).toBeDisabled();
  });

  it('shows a loading state until the correction context is available', () => {
    contextHook.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    renderDialog();

    expect(screen.getByRole('status')).toHaveTextContent('Loading bill…');
  });

  it('does not overwrite an unsaved draft when the same bill refetches', async () => {
    const view = renderDialog();
    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Unsaved explanation' } });
    contextHook.mockReturnValue({
      data: { ...context, items: [{ ...context.items[0], price: 99 }, context.items[1]] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    view.rerender(<CompletedBillCorrectionDialog queueEntryId="queue-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText('Correction reason')).toHaveValue('Unsaved explanation');
    expect(screen.getByLabelText('Consultation price (RM)')).toHaveValue(50);
  });

  it('resets the draft before showing a different queue entry', async () => {
    const view = renderDialog();
    await screen.findByLabelText('Consultation price (RM)');

    view.rerender(<CompletedBillCorrectionDialog queueEntryId="queue-2" open onOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.queryByLabelText('Consultation price (RM)')).not.toBeInTheDocument());
  });

  it('initializes a cached next queue exactly once after closing the prior queue', async () => {
    contextHook.mockImplementation((queueEntryId: string) => ({
      data: queueEntryId === 'queue-2'
        ? { ...context, queueEntryId: 'queue-2', fingerprint: 'fingerprint-2', items: [{ ...context.items[0], price: 25 }, context.items[1]] }
        : context,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    const view = renderDialog();
    await screen.findByLabelText('Consultation price (RM)');

    view.rerender(<CompletedBillCorrectionDialog queueEntryId="queue-2" open={false} onOpenChange={vi.fn()} />);
    view.rerender(<CompletedBillCorrectionDialog queueEntryId="queue-2" open onOpenChange={vi.fn()} />);

    expect(await screen.findByLabelText('Consultation price (RM)')).toHaveValue(25);
  });

  it('preserves server discount and tax while correcting an unrelated payment', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const adjustedContext = {
      ...context,
      originalTotals: {
        subtotal: 80, discountRm: 10, taxRm: 4.2, taxPct: 6, total: 74.2,
        paid: 40, outstanding: 34.2, creditDue: 0, status: 'outstanding' as const,
      },
    };
    contextHook.mockReturnValue({ data: adjustedContext, isLoading: false, isError: false, refetch: vi.fn() });
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    renderDialog();

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    expect(screen.getByLabelText('Discount (RM)')).toHaveValue(10);
    expect(screen.getByLabelText('Tax (%)')).toHaveValue(6);
    expect(screen.getByText('Original total: RM 74.20')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Payment 1 amount (RM)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ p_discount_rm: 10, p_tax_pct: 6 });
  });

  it('normalizes legacy and panel payments while correcting an unrelated field', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    contextHook.mockReturnValue({
      data: {
        ...context,
        payments: [
          { ...context.payments[0], paymentMethod: 'TNG / DuitNow QR' },
          { ...context.payments[0], id: 'payment-2', amount: 0, paymentMethod: 'Panel: Acme Health' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    renderDialog();

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].p_payments).toEqual([
      { id: 'payment-1', amount: 40, payment_method: 'qr_pay' },
      { id: 'payment-2', amount: 0, payment_method: 'panel' },
    ]);
  });

  it('blocks an unknown legacy payment method until the user selects a supported method', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    contextHook.mockReturnValue({
      data: {
        ...context,
        payments: [{ ...context.payments[0], paymentMethod: 'Legacy terminal voucher' }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    renderDialog();

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment record' } });

    expect(screen.getByText('Choose Cash, QR Pay, Card, Online Transfer, or Panel.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm correction' })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['Consultation quantity', '1.5', 'Quantity must be a whole number no greater than 1000000.'],
    ['Tax (%)', '101', 'Tax must be between 0 and 100 percent.'],
  ])('blocks server-invalid %s before confirmation', async (label, value, error) => {
    renderDialog();
    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment' } });

    expect(screen.getByText(error)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm correction' })).toBeDisabled();
  });

  it('keeps dispensed-medicine removal disabled and enforces its quantity floor', async () => {
    renderDialog();

    expect(await screen.findByText('2 already dispensed')).toBeVisible();
    expect(screen.queryByLabelText(/dispensed quantity/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Remove Medicine')).toBeDisabled();
    const quantity = screen.getByLabelText('Medicine quantity');
    expect(quantity).toHaveAttribute('min', '2');
    expect(screen.getByText('Dispensed quantity is protected and cannot be edited.')).toBeVisible();
  });

  it('previews credit due after an overpayment and submits only once', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    const { onOpenChange } = renderDialog();

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Payment 1 amount (RM)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment' } });
    expect(screen.getByText('Refund/Credit Due: RM 20.00')).toBeVisible();

    const confirm = screen.getByRole('button', { name: 'Confirm correction' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalledWith('Completed bill corrected');
  });

  it('closes as successful when a post-commit refresh fails', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const onCorrected = vi.fn().mockRejectedValue(new Error('Refresh unavailable'));
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    const { onOpenChange } = renderDialog(vi.fn(), onCorrected);

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalledWith('Completed bill corrected');
    expect(screen.queryByText('Refresh unavailable')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and offers reload when the bill is stale', async () => {
    const refetch = vi.fn();
    const mutateAsync = vi.fn().mockRejectedValue(new Error('This bill changed after you opened it. Reload and try again.'));
    contextHook.mockReturnValue({ data: context, isLoading: false, isError: false, refetch });
    correctBillHook.mockReturnValue({ mutateAsync, isPending: false });
    const { onOpenChange } = renderDialog();

    await screen.findByRole('heading', { name: 'Correct completed bill' });
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Correct payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));

    expect(await screen.findByText('This bill changed after you opened it. Reload and try again.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload bill' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
