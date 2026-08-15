import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const reportRefetch = vi.hoisted(() => vi.fn());
const manualRefetch = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ canEditManagementDashboard: false }),
}));
vi.mock('@/hooks/clinic/useManagementDashboard', () => ({
  useManagementDashboardReport: () => ({
    data: {}, isLoading: false, error: null, refetch: reportRefetch,
  }),
  useManagementDashboardManual: () => ({
    data: [], isLoading: false, error: null, refetch: manualRefetch,
  }),
  useSetManagementDashboardMetric: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteManagementDashboardMetric: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('@/components/clinic/dashboard/DashboardKpiStrip', () => ({
  DashboardKpiStrip: () => <section aria-label="Automatic KPI panel">Automatic KPI panel</section>,
}));
vi.mock('@/components/clinic/dashboard/FinancialOperationsPanel', () => ({
  FinancialOperationsPanel: () => <section aria-label="Automatic operations panel">Automatic operations panel</section>,
}));
vi.mock('@/components/clinic/dashboard/StockInventoryPanel', () => ({
  StockInventoryPanel: () => <section aria-label="Automatic stock panel">Automatic stock panel</section>,
}));
vi.mock('@/components/clinic/dashboard/ManualScorecardPanel', () => ({
  ManualScorecardPanel: ({ title }: { title: string }) => <section aria-label={title}>{title}</section>,
}));

import ManagementDashboard from '@/pages/clinic/ManagementDashboard';

const attendanceReport = {
  period: {
    startDate: '2026-05-25', endDate: '2026-08-16',
    comparisonStartDate: '2026-03-02', comparisonEndDate: '2026-05-24', timezone: 'Asia/Kuala_Lumpur' as const,
  },
  doctors: [],
  warnings: [],
  cells: [],
  hasAttendanceData: false,
};

function daysBetween(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000;
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ManagementDashboard />, { wrapper });
}

describe('ManagementDashboard attendance integration', () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: attendanceReport, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('places attendance after automatic panels and before manual scorecards', async () => {
    renderDashboard();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const automatic = screen.getByRole('region', { name: /automatic stock panel/i });
    const attendance = screen.getByRole('heading', { name: /patient attendance heatmap/i });
    const manual = screen.getByRole('region', { name: /growth & marketing/i });

    expect(automatic.compareDocumentPosition(attendance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attendance.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses its latest-twelve-week default independently from the dashboard month', async () => {
    renderDashboard();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [_name, args] = rpc.mock.calls[0] ?? [];
    fireEvent.change(screen.getByLabelText(/^month$/i), { target: { value: '2026-06' } });

    expect(screen.getByLabelText(/attendance period/i)).toHaveValue('latest_12_weeks');
    expect(args).toMatchObject({ _doctor_id: null });
    expect(daysBetween(args._start_date as string, args._end_date as string)).toBe(83);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps automatic and manual dashboard panels available when attendance fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Attendance report unavailable') });
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(/attendance report unavailable/i);
    expect(screen.getByRole('region', { name: /automatic KPI panel/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /growth & marketing/i })).toBeInTheDocument();
  });

  it('refetches active attendance data with the dashboard refresh control', async () => {
    renderDashboard();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /refresh dashboard/i }));

    expect(reportRefetch).toHaveBeenCalledTimes(1);
    expect(manualRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  });
});
