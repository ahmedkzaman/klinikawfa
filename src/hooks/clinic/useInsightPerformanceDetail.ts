import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeInsightPerformanceDetail } from '@/lib/clinic/insight/performanceDetails';
import type { InsightPerformanceViewerScope } from './useInsightPerformance';
import type { InsightPerformanceFilters } from './useInsightPerformance';

export function useInsightPerformanceDetail(
  startDate: string,
  endDate: string,
  kind: 'doctor' | 'service',
  id: string | null,
  viewerScope: InsightPerformanceViewerScope,
  filters: InsightPerformanceFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ['insight-performance-detail', startDate, endDate, kind, id, filters, {
      userId: viewerScope.userId,
      permissionVersion: viewerScope.reportsView.version,
    }],
    enabled: Boolean(id) && enabled && viewerScope.reportsView.allowed,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!id) throw new Error('Performance detail identity unavailable');
      const callDetail = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
      const { data, error } = await callDetail('get_insight_performance_detail_filtered', {
        _start_date: startDate, _end_date: endDate, _detail_kind: kind, _detail_id: id,
        _doctor_id: filters.doctorId, _payment_type: filters.paymentType,
        _activity_type: filters.activityType,
      });
      if (error) throw error;
      return normalizeInsightPerformanceDetail(data);
    },
  });
}
