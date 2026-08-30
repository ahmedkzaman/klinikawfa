import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn(), useMutation: vi.fn(), useQueryClient: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));

import { StockPlanningTab } from '@/components/clinic/procurement/dashboard/StockPlanningTab';
import { useProcurementStockPlanning, useDiagnosisCorrelation } from '@/hooks/clinic/useProcurementStats';
import type { StockPlanningRow } from '@/lib/clinic/procurementDashboard';

vi.mock('@/hooks/clinic/useProcurementStats', () => ({
  useProcurementStockPlanning: vi.fn(),
  useDiagnosisCorrelation: vi.fn(),
}));

const mockedPlanning = vi.mocked(useProcurementStockPlanning);
const mockedCorrelation = vi.mocked(useDiagnosisCorrelation);

function row(overrides: Partial<StockPlanningRow> = {}): StockPlanningRow {
  return {
    item_id: 'i1',
    name: 'Paracetamol 500mg',
    category: 'Medication',
    current_stock: 4,
    reorder_level: 10,
    used_30d: 60,
    avg_daily_usage: 0.667,
    days_cover: 6.2,
    movement_status: 'fast',
    open_order_qty: 0,
    supplier_lead_time_days: 7,
    nearest_expiry_date: null,
    suggested_qty: 10,
    recommendation_reason: 'Based on 90-day usage, lead time, and open orders',
    ...overrides,
  };
}

const baseQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
} as unknown as ReturnType<typeof mockedPlanning>;

function setup(planning: Partial<ReturnType<typeof mockedPlanning>>, rows: StockPlanningRow[] = []) {
  mockedPlanning.mockReturnValue({ ...baseQuery, data: rows, ...planning } as ReturnType<typeof mockedPlanning>);
  mockedCorrelation.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof mockedCorrelation>);
  render(<StockPlanningTab onDraftPO={() => {}} draftingItemId={null} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StockPlanningTab', () => {
  it('exposes the required table headers', () => {
    setup({ data: [row()] });
    for (const header of ['Item', 'Current stock', 'Recent usage', 'Days remaining', 'On order', 'Suggested order', 'Action']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('filters All, Low stock, Overstock, and Expiring within 90 days', () => {
    setup({
      data: [
        row({ item_id: 'low', name: 'Low Item', current_stock: 2, reorder_level: 10 }),
        row({ item_id: 'over', name: 'Over Item', current_stock: 500, movement_status: 'dead', avg_daily_usage: 0.5 }),
        row({ item_id: 'exp', name: 'Expiring Item', nearest_expiry_date: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) }),
        row({ item_id: 'ok', name: 'Healthy Item', current_stock: 100, reorder_level: 10, movement_status: 'normal' }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));
    expect(screen.getByText('Low Item')).toBeInTheDocument();
    expect(screen.queryByText('Healthy Item')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overstock' }));
    expect(screen.getByText('Over Item')).toBeInTheDocument();
    expect(screen.queryByText('Low Item')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expiring within 90 days' }));
    expect(screen.getByText('Expiring Item')).toBeInTheDocument();
    expect(screen.queryByText('Over Item')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Healthy Item')).toBeInTheDocument();
  });

  it('does not fabricate a quantity when usage data is insufficient', () => {
    setup({
      data: [
        row({
          name: 'No Usage Item',
          avg_daily_usage: 0,
          used_30d: 0,
          days_cover: null,
          movement_status: 'dead',
          suggested_qty: null,
          recommendation_reason: 'Insufficient usage data',
        }),
      ],
    });
    const cell = screen.getByText('Insufficient usage data').closest('td');
    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).queryByText(/^\d+$/)).toBeNull();
  });

  it('creates the order using the returned suggested_qty', () => {
    const onDraftPO = vi.fn();
    mockedPlanning.mockReturnValue({ ...baseQuery, data: [row()] } as ReturnType<typeof mockedPlanning>);
    mockedCorrelation.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof mockedCorrelation>);
    render(<StockPlanningTab onDraftPO={onDraftPO} draftingItemId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /create order/i }));
    expect(onDraftPO).toHaveBeenCalledWith('i1', 10);
  });

  it('shows the empty-filter message', () => {
    setup({ data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));
    expect(screen.getByText('No items match this filter.')).toBeInTheDocument();
  });

  it('uses QueryError with Retry on failure', () => {
    mockedPlanning.mockReturnValue({
      ...baseQuery,
      isError: true,
      error: new Error('permission denied'),
    } as unknown as ReturnType<typeof mockedPlanning>);
    mockedCorrelation.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof mockedCorrelation>);
    render(<StockPlanningTab onDraftPO={() => {}} draftingItemId={null} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  });

  it('renders skeleton rows while loading', () => {
    setup({ isLoading: true, data: undefined });
    expect(screen.queryByText('Paracetamol 500mg')).not.toBeInTheDocument();
  });

  it('shows a seasonal surge badge as display-only warning', () => {
    mockedPlanning.mockReturnValue({ ...baseQuery, data: [row()] } as ReturnType<typeof mockedPlanning>);
    mockedCorrelation.mockReturnValue({
      data: [{ diagnosis_group: 'URI', inventory_item_id: 'i1', case_trend_pct: 40, lift_score: 2.1, item_name: 'Paracetamol 500mg' }],
      isLoading: false,
    } as ReturnType<typeof mockedCorrelation>);
    render(<StockPlanningTab onDraftPO={() => {}} draftingItemId={null} />);
    expect(screen.getByText(/surge/i)).toBeInTheDocument();
    // suggested qty displayed is still the view's value (10)
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
