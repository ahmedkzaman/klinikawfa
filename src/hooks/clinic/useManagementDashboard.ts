import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeDashboardReport,
  type DashboardManualMetric,
  type DashboardManualMetricInput,
  type ManagementDashboardReport,
  type ManagementMetricKey,
} from '@/lib/clinic/managementDashboard';

type DbResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type DashboardClient = {
  rpc: (name: string, args: Record<string, unknown>) => DbResult<unknown>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => DbResult<DashboardManualMetric[]>;
      };
    };
  };
};

const dashboardDb = supabase as unknown as DashboardClient;

export function useManagementDashboardReport(monthStart: string) {
  return useQuery<ManagementDashboardReport>({
    queryKey: ['clinic', 'management-dashboard', 'report', monthStart],
    enabled: Boolean(monthStart),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await dashboardDb.rpc('get_management_dashboard', {
        _month_start: monthStart,
      });
      if (error) throw new Error(error.message);
      return normalizeDashboardReport(data);
    },
  });
}

export function useManagementDashboardManual(monthStart: string) {
  return useQuery<DashboardManualMetric[]>({
    queryKey: ['clinic', 'management-dashboard', 'manual', monthStart],
    enabled: Boolean(monthStart),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await dashboardDb
        .from('management_dashboard_monthly_metrics')
        .select('*')
        .eq('month_start', monthStart)
        .order('metric_key', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useSetManagementDashboardMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DashboardManualMetricInput) => {
      const { data, error } = await dashboardDb.rpc('set_management_dashboard_metric', {
        _month_start: input.monthStart,
        _metric_key: input.metricKey,
        _target_numeric: input.targetNumeric,
        _actual_numeric: input.actualNumeric,
        _status: input.status,
        _notes: input.notes,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: ['clinic', 'management-dashboard', 'manual', input.monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ['clinic', 'management-dashboard', 'report', input.monthStart],
      });
    },
  });
}

export function useDeleteManagementDashboardMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { monthStart: string; metricKey: ManagementMetricKey }) => {
      const { data, error } = await dashboardDb.rpc('delete_management_dashboard_metric', {
        _month_start: input.monthStart,
        _metric_key: input.metricKey,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: ['clinic', 'management-dashboard', 'manual', input.monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ['clinic', 'management-dashboard', 'report', input.monthStart],
      });
    },
  });
}
