import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface InsightSummary {
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  marginPct: number;
  patientVolume: number;
}

export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
  cogs: number;
  profit: number;
}

export interface TopItemRow {
  itemName: string;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface LtvSegmentRow {
  segment: string; // 'Panel' | 'Self-Pay' | etc.
  paymentMethod: string;
  totalProfit: number;
  totalRevenue: number;
  patientCount: number;
  avgProfitPerPatient: number;
}

export interface RawFinancialRow {
  visit_date: string;
  queue_entry_id: string;
  payment_method: string | null;
  item_name: string;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface FinancialInsights {
  summary: InsightSummary;
  dailyTrends: DailyTrendPoint[];
  topItems: TopItemRow[];
  ltvSegment: LtvSegmentRow[];
  rows: RawFinancialRow[];
}

interface ViewRow {
  id: string;
  item_name: string;
  visit_date: string;
  payment_method: string | null;
  revenue: number | string | null;
  profit: number | string | null;
  queue_entry_id: string;
}

const SELF_PAY_KEYS = ['cash', 'card', 'fpx', 'qr', 'tng', 'self', 'self-pay', 'selfpay'];

function classifySegment(method: string | null): string {
  if (!method) return 'Self-Pay';
  const m = method.toLowerCase();
  if (SELF_PAY_KEYS.some((k) => m.includes(k))) return 'Self-Pay';
  return 'Panel';
}

// View is not in generated types — use loose client for this read-only query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useFinancialInsights(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<FinancialInsights>({
    queryKey: ['financial-insights', startKey, endKey],
    queryFn: async () => {
      const { data, error } = await db
        .from('insight_financials_view')
        .select('id, item_name, visit_date, payment_method, revenue, profit, queue_entry_id')
        .gte('visit_date', startKey)
        .lte('visit_date', endKey);

      if (error) throw error;

      const rows: ViewRow[] = (data ?? []) as ViewRow[];

      // Summary
      let totalRevenue = 0;
      let totalCogs = 0;
      let totalProfit = 0;
      const uniqueQueueIds = new Set<string>();

      // Daily map
      const dailyMap = new Map<string, { revenue: number; cogs: number; profit: number }>();
      // Items map
      const itemMap = new Map<string, { revenue: number; cogs: number; profit: number }>();
      // Segment map: payment_method -> aggregates + queue ids
      const segmentMap = new Map<
        string,
        { revenue: number; profit: number; queueIds: Set<string>; segment: string }
      >();

      for (const r of rows) {
        const rev = Number(r.revenue ?? 0);
        const prof = Number(r.profit ?? 0);
        const cogs = rev - prof; // GAAP-aligned: COGS = Revenue − Profit

        totalRevenue += rev;
        totalCogs += cogs;
        totalProfit += prof;
        uniqueQueueIds.add(r.queue_entry_id);

        const day = dailyMap.get(r.visit_date) ?? { revenue: 0, cogs: 0, profit: 0 };
        day.revenue += rev;
        day.cogs += cogs;
        day.profit += prof;
        dailyMap.set(r.visit_date, day);

        const item = itemMap.get(r.item_name) ?? { revenue: 0, cogs: 0, profit: 0 };
        item.revenue += rev;
        item.cogs += cogs;
        item.profit += prof;
        itemMap.set(r.item_name, item);

        const methodKey = r.payment_method ?? 'unspecified';
        const seg = segmentMap.get(methodKey) ?? {
          revenue: 0,
          profit: 0,
          queueIds: new Set<string>(),
          segment: classifySegment(r.payment_method),
        };
        seg.revenue += rev;
        seg.profit += prof;
        seg.queueIds.add(r.queue_entry_id);
        segmentMap.set(methodKey, seg);
      }

      const summary: InsightSummary = {
        totalRevenue,
        totalCogs,
        totalProfit,
        marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        patientVolume: uniqueQueueIds.size,
      };

      const dailyTrends: DailyTrendPoint[] = Array.from(dailyMap.entries())
        .map(([date, v]) => ({ date, revenue: v.revenue, cogs: v.cogs, profit: v.profit }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const topItems: TopItemRow[] = Array.from(itemMap.entries())
        .map(([itemName, v]) => ({ itemName, revenue: v.revenue, cogs: v.cogs, profit: v.profit }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

      // Roll segment map up by classified segment (Panel vs Self-Pay)
      const rolledSegments = new Map<
        string,
        { revenue: number; profit: number; queueIds: Set<string>; paymentMethods: Set<string> }
      >();
      for (const [method, v] of segmentMap.entries()) {
        const existing = rolledSegments.get(v.segment) ?? {
          revenue: 0,
          profit: 0,
          queueIds: new Set<string>(),
          paymentMethods: new Set<string>(),
        };
        existing.revenue += v.revenue;
        existing.profit += v.profit;
        v.queueIds.forEach((id) => existing.queueIds.add(id));
        existing.paymentMethods.add(method);
        rolledSegments.set(v.segment, existing);
      }

      const ltvSegment: LtvSegmentRow[] = Array.from(rolledSegments.entries())
        .map(([segment, v]) => ({
          segment,
          paymentMethod: Array.from(v.paymentMethods).join(', '),
          totalProfit: v.profit,
          totalRevenue: v.revenue,
          patientCount: v.queueIds.size,
          avgProfitPerPatient: v.queueIds.size > 0 ? v.profit / v.queueIds.size : 0,
        }))
        .sort((a, b) => b.totalProfit - a.totalProfit);

      const rawRows: RawFinancialRow[] = rows.map((r) => {
        const rev = Number(r.revenue ?? 0);
        const prof = Number(r.profit ?? 0);
        return {
          visit_date: r.visit_date,
          queue_entry_id: r.queue_entry_id,
          payment_method: r.payment_method,
          item_name: r.item_name,
          revenue: rev,
          cogs: rev - prof,
          profit: prof,
        };
      });

      return { summary, dailyTrends, topItems, ltvSegment, rows: rawRows };
    },
  });
}
