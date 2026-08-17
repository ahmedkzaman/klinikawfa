import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { buildClinicAlerts } from '@/lib/clinic/insight/alerts';
import { scoreClinicHealth } from '@/lib/clinic/insight/healthScore';
import type { InsightQueryOptions } from './useInsightSectionData';

// The RPC is additive and generated Supabase types are refreshed separately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useClinicHealth(startDate: Date, endDate: Date, options?: InsightQueryOptions) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['clinic-health', startKey, endKey],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_insight_clinic_health_metrics', {
        _start_date: startKey,
        _end_date: endKey,
      });
      if (error) throw error;
      const score = scoreClinicHealth(data);
      return { metrics: data, score, alerts: data ? buildClinicAlerts(data, endKey) : [] };
    },
  });
}
