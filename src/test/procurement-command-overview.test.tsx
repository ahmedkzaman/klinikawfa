import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useMutation = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation,
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock('@/hooks/clinic/useProcurementDashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/clinic/useProcurementDashboard')>();
  return {
    ...actual,
    useProcurementDashboard: vi.fn(),
  };
});

import { CommandOverviewTab } from '@/components/clinic/procurement/dashboard/CommandOverviewTab';
import { useProcurementDashboard } from '@/hooks/clinic/useProcurementDashboard';
import type { ProcurementDashboardReport } from '@/lib/clinic/procurementDashboard';

const mockReport = (overrides: Partial<ProcurementDashboardReport> = {}): ProcurementDashboardReport => ({
  month: '2026-08-01',
  budgetRows: [
    { category: 'medicines', budget: 5000, committed: 1200, received: 800, remaining: 3000 },
    { category: 'consumables', budget: 1000, committed: 200, received: 0, remaining: 800 },
    { category: 'vaccines', budget: 0, committed: 0, received: 0, remaining: 0 },
    { category: 'other', budget: 0, committed: 0, received: 0, remaining: 0 },
  ],
  totals: { budget: 6000, committed: 1400, received: 800, remaining: 3800 },
  counts: { stockoutRisk: 3, awaitingApproval: 2, awaitingDelivery: 5, overdue: 1, expiringSoon: 4 },
  actions: [
    { id: 'stockout:i1', kind: 'stockout', title: 'Paracetamol may run out in 3 days', dueDate: null, poId: null, itemId: 'i1' },
    { id: 'approval:p1', kind: 'approval', title: 'PO-2026-001 awaiting management approval', dueDate: null, poId: 'p1', itemId: null },
  ],
  ...overrides,
});

const mockedUseDashboard = vi.mocked(useProcurementDashboard);

function setup(query: Partial<ReturnType<typeof mockedUseDashboard>>, canApprove = true) {
  mockedUseDashboard.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as ReturnType<typeof mockedUseDashboard>);
  mockedUseDashboard.mockReturnValue(query as ReturnType<typeof mockedUseDashboard>);
  useMutation.mockImplementation((options: unknown) => options);

  render(
    <CommandOverviewTab
      month="2026-08-01"
      onMonthChange={() => {}}
      onOpenPO={() => {}}
      onCreateOrder={() => {}}
      canApprove={canApprove}
    />,
  );
}

describe('CommandOverviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders KPI cards, budget rows, and the action centre', () => {
    setup({ data: mockReport(), isLoading: false } as ReturnType<typeof mockedUseDashboard>);
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('Stock-out risk')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Things to do' })).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText(/PO-2026-001 awaiting management approval/)).toBeInTheDocument();
    // budget row categories rendered
    expect(screen.getByText('Medicines')).toBeInTheDocument();
    expect(screen.getByText('Consumables')).toBeInTheDocument();
  });

  it('renders action buttons wired to callbacks', async () => {
    const onOpenPO = vi.fn();
    const onCreateOrder = vi.fn();
    mockedUseDashboard.mockReturnValue({
      data: mockReport(),
      isLoading: false,
    } as ReturnType<typeof mockedUseDashboard>);
    useMutation.mockImplementation((options: unknown) => options);
    render(
      <CommandOverviewTab
        month="2026-08-01"
        onMonthChange={() => {}}
        onOpenPO={onOpenPO}
        onCreateOrder={onCreateOrder}
        canApprove
      />,
    );
    const actionButtons = screen.getAllByRole('button', { name: /approve|create order|follow up|mark received|review|open/i });
    expect(actionButtons.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onOpenPO).toHaveBeenCalledWith('p1');
  });

  it('shows Retry and no RM 0.00 placeholder on query error', () => {
    mockedUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('permission denied'),
      refetch: vi.fn(),
    } as ReturnType<typeof mockedUseDashboard>);
    useMutation.mockImplementation((options: unknown) => options);
    render(
      <CommandOverviewTab
        month="2026-08-01"
        onMonthChange={() => {}}
        onOpenPO={() => {}}
        onCreateOrder={() => {}}
        canApprove
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('RM 0.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Monthly budget')).not.toBeInTheDocument();
  });

  it('hides budget editing when canApprove is false', () => {
    setup({ data: mockReport(), isLoading: false } as ReturnType<typeof mockedUseDashboard>, false);
    expect(screen.queryByRole('button', { name: /edit budget/i })).not.toBeInTheDocument();
  });

  it('shows four category fields when management opens the editor', async () => {
    setup({ data: mockReport(), isLoading: false } as ReturnType<typeof mockedUseDashboard>);
    fireEvent.click(screen.getByRole('button', { name: /edit budget/i }));
    expect(screen.getByLabelText(/medicines/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/consumables/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vaccines/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/other/i)).toBeInTheDocument();
  });

  it('caps the visible actions at 12 with a View all hint', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `overdue:p${i}`,
      kind: 'overdue' as const,
      title: `PO-${1000 + i} overdue`,
      dueDate: '2026-08-01',
      poId: `p${i}`,
      itemId: null,
    }));
    setup({ data: mockReport({ actions: many }), isLoading: false } as ReturnType<typeof mockedUseDashboard>);
    expect(screen.getByText(/view all/i)).toBeInTheDocument();
    // 12 action rows rendered, not 15
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
  });

  it('renders skeleton while loading', () => {
    setup({ data: undefined, isLoading: true } as ReturnType<typeof mockedUseDashboard>);
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
  });
});
