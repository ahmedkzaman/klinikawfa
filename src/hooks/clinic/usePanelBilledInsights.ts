import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import {
  aggregatePanelBilledClaims,
  type PanelBilledSummary,
  type PanelClaimRow,
} from '@/lib/clinic/panelBilledInsights';

export function usePanelBilledInsights(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<PanelBilledSummary>({
    queryKey: ['panel-billed-insights', startKey, endKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_claims')
        .select('amount, status')
        .gte('claim_date', startKey)
        .lte('claim_date', endKey)
        .not('status', 'in', '(rejected,cancelled)');

      if (error) throw error;
      return aggregatePanelBilledClaims((data ?? []) as PanelClaimRow[]);
    },
  });
}
