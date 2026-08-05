import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelClaims from '@/pages/clinic/PanelClaims';

const mutateAsync = vi.fn();
const usePanelClaimsMock = vi.fn();

vi.mock('@/components/clinic/claims/ClaimDetailsSheet', () => ({ default: () => null }));
vi.mock('@/hooks/clinic/usePanelClaims', () => ({
  PANEL_CLAIMS_PAGE_SIZE: 50,
  getPanelClaimBalances: ({ amount, received_amount }: { amount: number; received_amount: number }) => ({
    received: received_amount,
    outstanding: amount - received_amount,
  }),
  usePanelClaims: (...args: unknown[]) => {
    usePanelClaimsMock(...args);
    return ({
    data: {
      rows: [
        {
          id: 'claim-pending', claim_no: 'PC-PENDING', amount: 100, received_amount: 0,
          status: 'pending', claim_date: '2026-08-05', due_date: null, submitted_date: null,
          approved_amount: null, write_off_amount: null, payment_reference: null,
          received_date: null, gl_document_url: null, remarks: null, portions_version: 0,
          is_overdue: false, insurance_providers: { name: 'Panel A' }, patients: { name: 'Patient A' },
          updater: null,
        },
        {
          id: 'claim-received', claim_no: 'PC-RECEIVED', amount: 100, received_amount: 100,
          status: 'received', claim_date: '2026-08-05', due_date: null, submitted_date: '2026-08-05',
          approved_amount: 100, write_off_amount: 0, payment_reference: 'REF-1',
          received_date: '2026-08-05', gl_document_url: null, remarks: null, portions_version: 0,
          is_overdue: false, insurance_providers: { name: 'Panel A' }, patients: { name: 'Patient B' },
          updater: null,
        },
      ],
      total: 2,
    },
    isLoading: false,
    });
  },
  usePanelClaimsSummary: () => ({ data: undefined }),
  useBulkMarkClaimsSubmitted: () => ({ mutateAsync, isPending: false }),
  usePanelClaimPortionCounts: () => ({ data: {} }),
}));

describe('panel claims bulk submission UI', () => {
  beforeEach(() => {
    usePanelClaimsMock.mockClear();
    window.history.replaceState({}, '', '/clinic/panel-claims');
  });

  it('selects only non-terminal claims for bulk submission', () => {
    render(<PanelClaims />);

    const selectAll = screen.getByRole('checkbox', { name: 'Select all visible claims' });
    const pending = screen.getByRole('checkbox', { name: 'Select claim PC-PENDING' });
    const received = screen.getByRole('checkbox', { name: 'Select claim PC-RECEIVED' });

    expect(received).toBeDisabled();
    fireEvent.click(selectAll);
    expect(pending).toHaveAttribute('data-state', 'checked');
    expect(received).toHaveAttribute('data-state', 'unchecked');
  });

  it('opens the pending tab when linked from Financial Control', () => {
    window.history.pushState({}, '', '/clinic/panel-claims?tab=pending');

    render(<PanelClaims />);

    expect(usePanelClaimsMock).toHaveBeenCalledWith('pending', 0);
    expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute('aria-pressed', 'true');
  });
});
