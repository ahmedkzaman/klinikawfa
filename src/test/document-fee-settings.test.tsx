import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin' }));
const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: database.select }),
    rpc: database.rpc,
  },
}));

import { DocumentFeeSettings } from '@/components/clinic/settings/DocumentFeeSettings';

const feeRows = [
  { document_type: 'mc', amount: '15.00' },
  { document_type: 'prescription', amount: 15 },
  { document_type: 'referral', amount: 15 },
  { document_type: 'quarantine', amount: 15 },
];

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentFeeSettings />
    </QueryClientProvider>,
  );
}

describe('DocumentFeeSettings', () => {
  beforeEach(() => {
    auth.role = 'admin';
    database.rpc.mockReset();
    database.select.mockReset();
    database.select.mockResolvedValue({ data: feeRows, error: null });
  });

  it('renders configured fees as Malaysian currency', async () => {
    renderSettings();

    expect(await screen.findByLabelText('Medical Certificate fee')).toHaveValue(15);
    expect(screen.getAllByText('RM15.00')).toHaveLength(4);
    expect(screen.getByLabelText('Quarantine Letter fee')).toHaveValue(15);
  });

  it.each(['ops_staff', 'operations', 'staff', 'resident_doctor', 'admin', 'doctor_admin'])(
    'allows %s to edit the Medical Certificate fee',
    async (role) => {
      auth.role = role;
      renderSettings();

      expect(await screen.findByLabelText('Medical Certificate fee')).toBeEnabled();
    },
  );

  it('does not let a locum edit document fees', async () => {
    auth.role = 'locum';
    renderSettings();

    expect(await screen.findByLabelText('Medical Certificate fee')).toBeDisabled();
    expect(screen.getByLabelText('Prescription Slip fee')).toBeDisabled();
    expect(screen.getByLabelText('Referral Letter fee')).toBeDisabled();
    expect(screen.getByLabelText('Quarantine Letter fee')).toBeDisabled();
  });

  it('limits prescription and referral editing to admins', async () => {
    auth.role = 'resident_doctor';
    const view = renderSettings();

    expect(await screen.findByLabelText('Prescription Slip fee')).toBeDisabled();
    expect(screen.getByLabelText('Referral Letter fee')).toBeDisabled();
    expect(screen.getByLabelText('Quarantine Letter fee')).toBeDisabled();

    view.unmount();
    auth.role = 'admin';
    renderSettings();

    expect(await screen.findByLabelText('Prescription Slip fee')).toBeEnabled();
    expect(screen.getByLabelText('Referral Letter fee')).toBeEnabled();
    expect(screen.getByLabelText('Quarantine Letter fee')).toBeEnabled();
  });

  it('rejects values with more than two decimal places without saving', async () => {
    renderSettings();
    const input = await screen.findByLabelText('Medical Certificate fee');

    fireEvent.change(input, { target: { value: '15.999' } });
    expect(screen.getByText('Enter an amount from RM0.00 to RM99,999,999.99 with up to 2 decimal places.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Medical Certificate fee' })).toBeDisabled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it('saves a permitted fee through the reviewed RPC', async () => {
    database.rpc.mockResolvedValue({
      data: { document_type: 'mc', amount: 18.5 },
      error: null,
    });
    renderSettings();
    const input = await screen.findByLabelText('Medical Certificate fee');

    fireEvent.change(input, { target: { value: '18.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Medical Certificate fee' }));

    await waitFor(() =>
      expect(database.rpc).toHaveBeenCalledWith('set_clinic_document_fee', {
        _amount: 18.5,
        _document_type: 'mc',
      }),
    );
    expect(await screen.findByText('RM18.50')).toBeInTheDocument();
  });
});
