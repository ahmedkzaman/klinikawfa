import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeInsightPerformanceReport,
  type InsightPerformanceReport,
} from '@/lib/clinic/insight/performance';
import type { InsightQueryOptions } from './useInsightSectionData';

export const INSIGHT_PERFORMANCE_QUERY_ROOT = ['insight-performance'] as const;

export type InsightPerformanceViewerScope = {
  userId: string;
  reportsView: {
    allowed: boolean;
    version: string;
  };
};

export type InsightPerformanceFilters = {
  doctorId: string | null;
  paymentType: 'all' | 'self_pay' | 'panel';
  activityType: 'all' | 'consultation' | 'procedure' | 'document';
  includeComparison: boolean;
};

export const DEFAULT_INSIGHT_PERFORMANCE_FILTERS: InsightPerformanceFilters = {
  doctorId: null,
  paymentType: 'all',
  activityType: 'all',
  includeComparison: true,
};

export function useInsightPerformance(
  startDate: string,
  endDate: string,
  viewerScope: InsightPerformanceViewerScope,
  options?: InsightQueryOptions,
  filters: InsightPerformanceFilters = DEFAULT_INSIGHT_PERFORMANCE_FILTERS,
): UseQueryResult<InsightPerformanceReport, Error> {
  return useQuery<InsightPerformanceReport, Error>({
    queryKey: [
      ...INSIGHT_PERFORMANCE_QUERY_ROOT,
      startDate,
      endDate,
      {
        userId: viewerScope.userId,
        reportsViewAllowed: viewerScope.reportsView.allowed,
        permissionVersion: viewerScope.reportsView.version,
      },
      filters,
    ],
    enabled: viewerScope.reportsView.allowed && (options?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_insight_performance_filtered', {
        _start_date: startDate,
        _end_date: endDate,
        _doctor_id: filters.doctorId,
        _payment_type: filters.paymentType,
        _activity_type: filters.activityType,
        _include_comparison: filters.includeComparison,
      });
      if (error) throw error;
      return normalizeInsightPerformanceReport(data);
    },
  });
}
