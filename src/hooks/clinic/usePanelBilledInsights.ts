import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import type { InsightQueryOptions } from './useInsightSectionData';
import {
  aggregatePanelBilledClaims,
  type PanelBilledSummary,
  type PanelClaimRow,
} from '@/lib/clinic/panelBilledInsights';

type PanelReceiptSummary = {
  total_received?: number | string | null;
  attribution_complete?: boolean | null;
};

function receiptTotal(data: unknown): number | null {
  const summary = data as PanelReceiptSummary | null;
  if (summary?.attribution_complete === false) return null;
  const value = Number(summary?.total_received);
  if (!Number.isFinite(value)) throw new Error('Panel receipt summary returned an invalid total.');
  return value;
}

export function usePanelBilledInsights(startDate: Date, endDate: Date, options?: InsightQueryOptions) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<PanelBilledSummary>({
    queryKey: ['panel-billed-insights', startKey, endKey],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data: claims, error: claimsError } = await supabase
        .from('panel_claims')
        .select('id, queue_entry_id, claim_date, due_date, received_date, amount, received_amount, status, insurance_providers:panel_id ( id, name )')
        .gte('claim_date', startKey)
        .lte('claim_date', endKey);

      if (claimsError) throw claimsError;

      // Parent claims contain a cumulative received amount and only the latest
      // receipt date. The aggregate RPC reads each immutable receipt delta so
      // split and partial receipts remain attributed to their actual period.
      const { data: receipts, error: receiptsError } = await supabase.rpc(
        'get_panel_receipt_summary',
        { _start_date: startKey, _end_date: endKey },
      );

      if (receiptsError) throw receiptsError;
      const summary = aggregatePanelBilledClaims((claims ?? []) as PanelClaimRow[]);
      return {
        ...summary,
        totalReceived: receiptTotal(receipts),
      };
    },
  });
}
