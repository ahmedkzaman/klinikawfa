import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
  useQuery,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useInsightPerformance } from '@/hooks/clinic/useInsightPerformance';
import { useInsightPerformanceDetail } from '@/hooks/clinic/useInsightPerformanceDetail';

const response = {
  clinic: {
    completed_visits: 1,
    unique_patients: 1,
    rostered_hours: 5,
    patients_per_hour: 0.2,
    visit_billing: 50,
    patient_collected: 50,
    revenue_per_hour: 10,
    cogs: 10,
    gross_profit: 40,
    procedures: 1,
    documents: 0,
    self_pay_visits: 1,
    panel_visits: 0,
  },
  doctors: [],
  services: [],
  quality: { missing_attribution: 0, missing_cost_count: 0, excluded_voided_payments: 0 },
  confidence: { state: 'reliable', missing_attribution: 0, missing_cost_count: 0 },
  generated_at: '2026-08-17T04:00:00.000Z',
};

type QueryOptions = {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
};

const residentViewer = {
  userId: 'user-resident-1',
  reportsView: { allowed: true, version: '2026-08-17T05:00:00.000Z' },
};

describe('useInsightPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
  });

  it('sends the same global filters to the secured lazy-detail RPC', async () => {
    rpc.mockResolvedValue({ data: {
      kind: 'service', service_id: 'service-1', service_name: 'Dressing',
      trend: [], doctor_contribution: [], payment_mix: [], visits: [], current_catalog: null, margin_history: [],
    }, error: null });
    const filters = { doctorId: 'doctor-1', paymentType: 'panel' as const, activityType: 'procedure' as const, includeComparison: true };
    const query = useInsightPerformanceDetail(
      '2026-08-01', '2026-08-17', 'service', 'service-1', residentViewer, filters,
    ) as unknown as QueryOptions;
    await query.queryFn();
    expect(rpc).toHaveBeenCalledWith('get_insight_performance_detail_filtered', {
      _start_date: '2026-08-01', _end_date: '2026-08-17', _detail_kind: 'service', _detail_id: 'service-1',
      _doctor_id: 'doctor-1', _payment_type: 'panel', _activity_type: 'procedure',
    });
    expect(query.queryKey).toContainEqual(filters);
  });

  it('keys the role-safe report by dates, account identity, and effective permission version', async () => {
    rpc.mockResolvedValue({ data: response, error: null });

    const query = useInsightPerformance(
      '2026-08-01',
      '2026-08-17',
      residentViewer,
      undefined,
      { doctorId: 'doctor-1', paymentType: 'panel', activityType: 'procedure', includeComparison: false },
    ) as unknown as QueryOptions;

    expect(query.queryKey).toEqual([
      'insight-performance',
      '2026-08-01',
      '2026-08-17',
      {
        userId: 'user-resident-1',
        reportsViewAllowed: true,
        permissionVersion: '2026-08-17T05:00:00.000Z',
      },
      { doctorId: 'doctor-1', paymentType: 'panel', activityType: 'procedure', includeComparison: false },
    ]);
    await expect(query.queryFn()).resolves.toMatchObject({
      clinic: { completedVisits: 1, visitBilling: 50 },
      confidence: { state: 'reliable' },
    });
    expect(rpc).toHaveBeenCalledWith('get_insight_performance_filtered', {
      _start_date: '2026-08-01',
      _end_date: '2026-08-17',
      _doctor_id: 'doctor-1',
      _payment_type: 'panel',
      _activity_type: 'procedure',
      _include_comparison: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('honors the enabled option without dropping identity from the cache key', () => {
    const query = useInsightPerformance(
      '2026-08-01',
      '2026-08-17',
      {
        userId: 'user-operations-1',
        reportsView: { allowed: true, version: 'permission-v8' },
      },
      { enabled: false },
    ) as unknown as QueryOptions;

    expect(query.enabled).toBe(false);
    expect(query.queryKey).toEqual([
      'insight-performance',
      '2026-08-01',
      '2026-08-17',
      {
        userId: 'user-operations-1',
        reportsViewAllowed: true,
        permissionVersion: 'permission-v8',
      },
      { doctorId: null, paymentType: 'all', activityType: 'all', includeComparison: true },
    ]);
  });

  it('never schedules a query for an explicitly denied effective permission', () => {
    const query = useInsightPerformance('2026-08-01', '2026-08-17', {
      userId: 'user-denied-1',
      reportsView: { allowed: false, version: 'permission-v9' },
    }) as unknown as QueryOptions;

    expect(query.enabled).toBe(false);
    expect(query.queryKey).toContainEqual({
      userId: 'user-denied-1',
      reportsViewAllowed: false,
      permissionVersion: 'permission-v9',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws RPC and malformed-payload errors through the query function', async () => {
    const rpcError = new Error('performance report unavailable');
    rpc.mockResolvedValueOnce({ data: null, error: rpcError });
    const failed = useInsightPerformance(
      '2026-08-01', '2026-08-17', {
        userId: 'user-admin-1',
        reportsView: { allowed: true, version: 'permission-v1' },
      },
    ) as unknown as QueryOptions;
    await expect(failed.queryFn()).rejects.toBe(rpcError);

    rpc.mockResolvedValueOnce({ data: {}, error: null });
    const malformed = useInsightPerformance(
      '2026-08-01', '2026-08-17', {
        userId: 'user-admin-1',
        reportsView: { allowed: true, version: 'permission-v1' },
      },
    ) as unknown as QueryOptions;
    await expect(malformed.queryFn()).rejects.toThrow(/performance report/i);
  });
});
