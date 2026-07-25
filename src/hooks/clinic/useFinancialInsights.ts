import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getLocalDateRangeBounds } from '@/lib/clinic/salesInsights';

export interface InsightSummary {
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  marginPct: number;
  patientVolume: number;
  missingCogsLineCount: number;
}

export interface DailyTrendPoint {
  date: string;
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
  segment: string;
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
  hasMissingCogs: boolean;
  kind: string;
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
  cogs: number | string | null;
  profit: number | string | null;
  queue_entry_id: string;
  kind: string;
  queue_entry_created_at: string;
}

const SELF_PAY_KEYS = ['cash', 'card', 'fpx', 'qr', 'tng', 'self', 'self-pay', 'selfpay'];

function classifySegment(method: string | null): string {
  if (!method) return 'Self-Pay';
  const m = method.toLowerCase();
  if (SELF_PAY_KEYS.some((k) => m.includes(k))) return 'Self-Pay';
  return 'Panel';
}

function toNumber(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

// View is not in generated types; use loose client for this read-only query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function parseFinancialRow(r: ViewRow) {
  const rev = toNumber(r.revenue);
  const cogs = toNumber(r.cogs);
  const hasStoredCogs = Number.isFinite(Number(r.cogs ?? NaN));
  const hasStoredProfit = Number.isFinite(Number(r.profit ?? NaN));
  const hasMissingCogs = !hasStoredCogs && !hasStoredProfit && r.kind === 'medication';
  if (hasMissingCogs) {
    return { rev, cogs: 0, profit: 0, hasMissingCogs };
  }

  const profProvided = hasStoredProfit ? Number(r.profit) : NaN;
  const profit = Number.isFinite(profProvided) ? profProvided : rev - cogs;

  return { rev, cogs, profit, hasMissingCogs };
}

export function useFinancialInsights(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<FinancialInsights>({
    queryKey: ['financial-insights', startKey, endKey],
    queryFn: async () => {
      const { startIso, endExclusiveIso } = getLocalDateRangeBounds(startDate, endDate);
      const { data, error } = await db
        .from('insight_financials_view')
        .select(
          'id, item_name, visit_date, payment_method, revenue, cogs, profit, queue_entry_id, kind, queue_entry_created_at',
        )
        .gte('queue_entry_created_at', startIso)
        .lt('queue_entry_created_at', endExclusiveIso);

      if (error) throw error;

      const rows: ViewRow[] = (data ?? []) as ViewRow[];

      let totalRevenue = 0;
      let totalCogs = 0;
      let totalProfit = 0;
      let missingCogsLineCount = 0;
      const uniqueQueueIds = new Set<string>();

      const dailyMap = new Map<string, { revenue: number; cogs: number; profit: number }>();
      const itemMap = new Map<string, { revenue: number; cogs: number; profit: number }>();
      const segmentMap = new Map<
        string,
        { revenue: number; profit: number; queueIds: Set<string>; segment: string }
      >();

      for (const r of rows) {
        const { rev, cogs, profit, hasMissingCogs } = parseFinancialRow(r);

        totalRevenue += rev;
        totalCogs += cogs;
        totalProfit += profit;
        uniqueQueueIds.add(r.queue_entry_id);
        if (hasMissingCogs) missingCogsLineCount += 1;

        const day = dailyMap.get(r.visit_date) ?? { revenue: 0, cogs: 0, profit: 0 };
        day.revenue += rev;
        day.cogs += cogs;
        day.profit += profit;
        dailyMap.set(r.visit_date, day);

        const item = itemMap.get(r.item_name) ?? { revenue: 0, cogs: 0, profit: 0 };
        item.revenue += rev;
        item.cogs += cogs;
        item.profit += profit;
        itemMap.set(r.item_name, item);

        const methodKey = r.payment_method ?? 'unspecified';
        const seg = segmentMap.get(methodKey) ?? {
          revenue: 0,
          profit: 0,
          queueIds: new Set<string>(),
          segment: classifySegment(r.payment_method),
        };
        seg.revenue += rev;
        seg.profit += profit;
        seg.queueIds.add(r.queue_entry_id);
        segmentMap.set(methodKey, seg);
      }

      const summary: InsightSummary = {
        totalRevenue,
        totalCogs,
        totalProfit,
        marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        patientVolume: uniqueQueueIds.size,
        missingCogsLineCount,
      };

      const dailyTrends: DailyTrendPoint[] = Array.from(dailyMap.entries())
        .map(([date, v]) => ({ date, revenue: v.revenue, cogs: v.cogs, profit: v.profit }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const topItems: TopItemRow[] = Array.from(itemMap.entries())
        .map(([itemName, v]) => ({ itemName, revenue: v.revenue, cogs: v.cogs, profit: v.profit }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

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
        const { rev, cogs, profit, hasMissingCogs } = parseFinancialRow(r);
        return {
          visit_date: r.visit_date,
          queue_entry_id: r.queue_entry_id,
          payment_method: r.payment_method,
          item_name: r.item_name,
          revenue: rev,
          cogs,
          profit,
          hasMissingCogs,
          kind: r.kind,
        };
      });

      return { summary, dailyTrends, topItems, ltvSegment, rows: rawRows };
    },
  });
}
