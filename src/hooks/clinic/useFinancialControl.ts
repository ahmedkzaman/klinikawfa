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

function dateKeyOrNull(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useFinancialControlSummary(
  range: DateRange,
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
    enabled: args !== null,
    queryFn: async () => {
      if (!args) throw new Error('Invalid financial control date range');

      const { data, error } = await supabase.rpc('get_financial_control_summary', args);
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
      const { data, error } = await supabase.rpc('get_financial_control_details', args);
      if (error) throw error;
      return parseFinancialControlDetails(data);
    },
  });
}
