import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  aggregateSalesInsights,
  getLocalDateRangeBounds,
  SALES_PAGE_SIZE,
  shouldFetchNextSalesPage,
  type SalesInsights,
  type SalesPaymentRow,
} from '@/lib/clinic/salesInsights';

export type {
  SalesDailyTrendPoint,
  SalesInsightRow,
  SalesInsights,
  SalesMethodRow,
  SalesSummary,
} from '@/lib/clinic/salesInsights';

export function useSalesInsights(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<SalesInsights>({
    queryKey: ['sales-insights', startKey, endKey],
    queryFn: async () => {
      const { startIso, endExclusiveIso } = getLocalDateRangeBounds(startDate, endDate);
      const rows: SalesPaymentRow[] = [];
      let page = 0;

      while (true) {
        const from = page * SALES_PAGE_SIZE;
        const to = from + SALES_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('payments')
          .select('id, created_at, queue_entry_id, consultation_id, payment_type, payment_method, amount')
          .is('deleted_at', null)
          .gte('created_at', startIso)
          .lt('created_at', endExclusiveIso)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (error) throw error;

        const pageRows = (data ?? []) as SalesPaymentRow[];
        rows.push(...pageRows);
        if (!shouldFetchNextSalesPage(pageRows.length)) break;
        page += 1;
      }

      return aggregateSalesInsights(rows);
    },
  });
}
