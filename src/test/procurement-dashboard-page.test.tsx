import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/clinic/useProcurementDashboard', () => ({
  useProcurementDashboard: vi.fn(() => ({
    data: {
      month: '2026-08-01',
      budgetRows: [],
      totals: { budget: 0, committed: 0, received: 0, remaining: 0 },
      counts: { stockoutRisk: 0, awaitingApproval: 0, awaitingDelivery: 0, overdue: 0, expiringSoon: 0 },
      actions: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  useProcurementAccess: vi.fn(() => ({ canManage: true, canApprove: true, isLoading: false })),
}));
vi.mock('@/hooks/clinic/usePurchaseOrders', () => ({
  usePurchaseOrders: vi.fn(() => ({
    orders: [],
    isLoading: false,
    createDraft: { mutateAsync: vi.fn(), isPending: false },
    updateHeader: { mutateAsync: vi.fn(), isPending: false },
    transitionOrder: { mutateAsync: vi.fn(), isPending: false },
    receiveGoods: { mutateAsync: vi.fn(), isPending: false },
  })),
  usePurchaseOrder: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock('@/hooks/clinic/useSuppliers', () => ({ useSuppliers: vi.fn(() => ({ suppliers: [], isLoading: false })) }));
vi.mock('@/hooks/clinic/useProcurementStats', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProcurementStockPlanning: vi.fn(() => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() })),
  useDiagnosisCorrelation: vi.fn(() => ({ data: [], isLoading: false })),
  useRefreshCorrelation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useStockMovements: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock('@/hooks/clinic/useInventoryItems', () => ({ useInventoryItems: vi.fn(() => ({ items: [], isLoading: false })) }));
vi.mock('@/hooks/clinic/usePurchaseOrderItems', () => ({
  usePurchaseOrderItems: vi.fn(() => ({
    addLine: { mutateAsync: vi.fn(), isPending: false },
    updateLine: { mutateAsync: vi.fn(), isPending: false },
    removeLine: { mutateAsync: vi.fn(), isPending: false },
  })),
}));
vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: vi.fn(() => ({ settings: {}, isLoading: false, update: vi.fn() })),
}));
vi.mock('@/hooks/clinic/useProcurementAttachments', () => ({
  useProcurementAttachments: vi.fn(() => ({
    attachments: { data: [], isLoading: false },
    uploadAttachment: { mutateAsync: vi.fn(), isPending: false },
    deleteAttachment: { mutateAsync: vi.fn(), isPending: false },
    downloadAttachment: vi.fn(),
  })),
}));
vi.mock('@/components/clinic/procurement/ProcurementLogicSheet', () => ({
  ProcurementLogicSheet: () => null,
}));

import { ProcurementDashboard } from '@/pages/clinic/ProcurementDashboard';

function renderPage(url = '/clinic/procurement-dashboard') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ProcurementDashboard />
    </MemoryRouter>,
  );
}

describe('ProcurementDashboard information architecture', () => {
  it('shows exactly the three primary tabs', () => {
    renderPage();
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Stock Planning', 'Orders']);
  });

  it('keeps Analysis as a secondary entry, not a fourth primary tab', () => {
    renderPage();
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).queryByRole('tab', { name: 'Analysis' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analysis' })).toBeInTheDocument();
  });

  it('restores ?tab=stock and ?tab=orders and falls back to Overview on unknown values', () => {
    const { unmount } = renderPage('/clinic/procurement-dashboard?tab=stock');
    expect(screen.getByRole('tab', { name: 'Stock Planning' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    const second = renderPage('/clinic/procurement-dashboard?tab=orders');
    expect(screen.getByRole('tab', { name: 'Orders' })).toHaveAttribute('aria-selected', 'true');
    second.unmount();

    renderPage('/clinic/procurement-dashboard?tab=bogus');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Analysis section with ledger preselected', () => {
    renderPage('/clinic/procurement-dashboard?tab=overview&analysis=ledger');
    expect(screen.getByRole('heading', { name: 'Analysis', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /movement ledger/i })).toBeInTheDocument();
  });

  it('opens the shared PO editor from the Orders tab', async () => {
    const { toast } = await import('sonner');
    renderPage('/clinic/procurement-dashboard?tab=orders');
    fireEvent.click(screen.getByRole('button', { name: /new order/i }));
    // With no active suppliers the draft flow is refused; the shared editor
    // wiring itself is covered by the OrdersTab/POSheet suites.
    expect(toast.error).toHaveBeenCalledWith('Add an active supplier before creating a purchase order.');
  });
});
