import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

const useQuery = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
  useQuery,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  attendancePresetRange,
  malaysiaToday,
  useAttendanceHeatmap,
} from '@/hooks/clinic/useAttendanceHeatmap';

const { useQuery: realUseQuery } = await vi.importActual<typeof import('@tanstack/react-query')>(
  '@tanstack/react-query',
);

const validReport = {
  period: {
    start_date: '2026-05-25',
    end_date: '2026-08-16',
    comparison_start_date: '2026-03-02',
    comparison_end_date: '2026-05-24',
  },
  cells: [],
  doctors: [],
  warnings: [],
  observations: [{
    date: '2026-08-03',
    weekday: 1,
    hour: 8,
    visits: 4,
    averageWaitMinutes: 18.5,
    waitMeasuredVisits: 4,
    doctorsRostered: 2,
    selectedDoctorScheduled: true,
    backupDoctorCovered: true,
  }],
};

function useAttendanceHeatmapOptions(input: Parameters<typeof useAttendanceHeatmap>[0]) {
  return useAttendanceHeatmap(input) as unknown as {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  };
}

describe('attendance heatmap periods', () => {
  it('uses the Malaysia-local day even when the supplied instant is on the prior UTC date', () => {
    expect(malaysiaToday(new Date('2026-08-15T18:30:00.000Z'))).toBe('2026-08-16');
  });

  it('defaults to the latest twelve full weeks ending today, inclusively', () => {
    expect(attendancePresetRange({ preset: 'latest_12_weeks', now: new Date('2026-08-15T18:30:00.000Z') }))
      .toEqual({ startDate: '2026-05-25', endDate: '2026-08-16' });
  });

  it('returns inclusive current-month and current-quarter boundaries', () => {
    const now = new Date('2026-05-15T12:00:00.000Z');

    expect(attendancePresetRange({ preset: 'month', now })).toEqual({
      startDate: '2026-05-01', endDate: '2026-05-31',
    });
    expect(attendancePresetRange({ preset: 'quarter', now })).toEqual({
      startDate: '2026-04-01', endDate: '2026-06-30',
    });
  });

  it('keeps a valid custom range inclusive and rejects reversed or over-366-day ranges', () => {
    expect(attendancePresetRange({ preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' }))
      .toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(() => attendancePresetRange({ preset: 'custom', startDate: '2026-02-28', endDate: '2026-02-01' }))
      .toThrow(/date range/i);
    expect(() => attendancePresetRange({ preset: 'custom', startDate: '2025-01-01', endDate: '2026-01-02' }))
      .toThrow(/date range/i);
  });
});

describe('useAttendanceHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
  });

  it('uses the selected range and doctor in the cache key and RPC contract', async () => {
    rpc.mockResolvedValue({ data: validReport, error: null });

    const query = useAttendanceHeatmapOptions({ startDate: '2026-05-25', endDate: '2026-08-16', doctorId: 'doctor-1' });

    await expect(query.queryFn()).resolves.toMatchObject({
      period: {
        startDate: '2026-05-25',
        endDate: '2026-08-16',
        comparisonStartDate: '2026-03-02',
        comparisonEndDate: '2026-05-24',
      },
      observations: [{
        date: '2026-08-03', weekday: 1, hour: 8, visits: 4,
        averageWaitMinutes: 18.5, waitMeasuredVisits: 4,
        doctorsRostered: 2, selectedDoctorScheduled: true, backupDoctorCovered: true,
      }],
    });
    expect(query.queryKey).toEqual(['clinical-attendance-heatmap', '2026-05-25', '2026-08-16', 'doctor-1']);
    expect(rpc).toHaveBeenCalledWith('get_clinical_attendance_heatmap', {
      _start_date: '2026-05-25',
      _end_date: '2026-08-16',
      _doctor_id: 'doctor-1',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('uses the all-doctors cache key and null doctor RPC parameter', async () => {
    rpc.mockResolvedValue({ data: validReport, error: null });
    const query = useAttendanceHeatmapOptions({ startDate: '2026-05-25', endDate: '2026-08-16', doctorId: null });

    expect(query.queryKey).toEqual(['clinical-attendance-heatmap', '2026-05-25', '2026-08-16', 'all']);
    await query.queryFn();
    expect(rpc).toHaveBeenCalledWith('get_clinical_attendance_heatmap', {
      _start_date: '2026-05-25',
      _end_date: '2026-08-16',
      _doctor_id: null,
    });
  });

  it('disables querying for invalid ranges', () => {
    const query = useAttendanceHeatmapOptions({ startDate: '2026-08-16', endDate: '2026-08-15', doctorId: null });

    expect(query.enabled).toBe(false);
  });

  it('surfaces an RPC error through React Query', async () => {
    const error = new Error('attendance report unavailable');
    rpc.mockResolvedValue({ data: null, error });
    useQuery.mockImplementation(realUseQuery);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAttendanceHeatmap({ startDate: '2026-05-25', endDate: '2026-08-16', doctorId: null }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});
