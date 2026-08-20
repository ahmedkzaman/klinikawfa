import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';
import {
  getFinancialControlDetailArguments,
  getFinancialControlSummaryArguments,
  isValidFinancialControlDateRange,
  parseFinancialControlDetails,
  parseFinancialControlSummary,
  type FinancialControlDetailFilters,
  type FinancialControlDetailResponse,
  type FinancialControlSummary,
} from '@/lib/clinic/financialControl';
import type { InsightQueryOptions } from './useInsightSectionData';

function dateKeyOrNull(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useFinancialControlSummary(
  range: DateRange,
  options?: InsightQueryOptions,
): UseQueryResult<FinancialControlSummary, Error> {
  const args = getFinancialControlSummaryArguments(range);
  const queryKey = args
    ? [
        'financial-control',
        'summary',
        args._start_date,
        args._end_date,
        args._comparison_start,
        args._comparison_end,
        args._as_of_date,
      ]
    : ['financial-control', 'summary', dateKeyOrNull(range.from), dateKeyOrNull(range.to)];

  return useQuery<FinancialControlSummary, Error>({
    queryKey,
    enabled: args !== null && (options?.enabled ?? true),
    queryFn: async () => {
      if (!args) throw new Error('Invalid financial control date range');

      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (name: string, args: typeof args) => Promise<{ data: unknown; error: Error | null }>)('get_insight_financial_control_summary', args);
      if (error) throw error;
      return parseFinancialControlSummary(data);
    },
  });
}

export function useFinancialControlDetails(
  filters: FinancialControlDetailFilters,
): UseQueryResult<FinancialControlDetailResponse, Error> {
  const startKey = dateKeyOrNull(filters.startDate);
  const endKey = dateKeyOrNull(filters.endDate);
  const queryKey = [
    'financial-control',
    'details',
    startKey,
    endKey,
    endKey,
    filters.metric,
    filters.groupBy,
    filters.alertKey,
    filters.page,
    filters.pageSize,
  ];

  return useQuery<FinancialControlDetailResponse, Error>({
    queryKey,
    enabled: isValidFinancialControlDateRange(filters.startDate, filters.endDate),
    queryFn: async () => {
      const args = getFinancialControlDetailArguments(filters);
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (name: string, args: typeof args) => Promise<{ data: unknown; error: Error | null }>)('get_insight_financial_control_details', args);
      if (error) throw error;
      const parsed = parseFinancialControlDetails(data);
      const missingPanelQueueIds = parsed.rows
        .filter((row) => row.paymentType === 'panel' && row.outstanding === null && row.queueEntryId)
        .map((row) => row.queueEntryId as string);

      if (missingPanelQueueIds.length === 0) return parsed;

      const { data: claims, error: claimsError } = await supabase
        .from('panel_claims')
        .select('queue_entry_id, amount, received_amount, status, claim_date, due_date, created_at')
        .in('queue_entry_id', missingPanelQueueIds);

      // The ledger remains the authoritative source. This fallback only fills
      // historical gaps from the live visit-linked claim when the ledger
      // cannot attribute an outstanding balance.
      if (claimsError || !claims) return parsed;

      const claimsByVisit = new Map(claims.map((claim) => [claim.queue_entry_id, claim]));
      const rows = parsed.rows.map((row) => {
        if (!row.queueEntryId || row.outstanding !== null || row.paymentType !== 'panel') return row;
        const claim = claimsByVisit.get(row.queueEntryId);
        if (!claim) return row;
        const closed = claim.status === 'rejected' || claim.status === 'cancelled';
        return {
          ...row,
          outstanding: closed
            ? 0
            : Math.max(Number(claim.amount ?? 0) - Number(claim.received_amount ?? 0), 0),
          claimStatus: claim.status,
          claimCreatedDate: claim.claim_date ?? claim.created_at?.slice(0, 10) ?? null,
          claimDueDate: claim.due_date,
        };
      });

      return { ...parsed, rows };
    },
  });
}
