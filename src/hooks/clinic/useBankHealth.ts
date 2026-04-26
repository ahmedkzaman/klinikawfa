import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

const LIQUID_METHODS = new Set(['cash', 'qr', 'credit_card', 'debit_card']);
const PROFIT_PER_VISIT_BENCHMARK = 80; // RM
const GROWTH_CAP = 0.5; // ±50%

export interface AxisContext {
  revenue: number;
  profit: number;
  marginPct: number;
  topDoctorName: string;
  topDoctorSharePct: number;
  profitPerPatient: number;
  patientCount: number;
  liquidPct: number;
  growthPct: number | null; // null when prior revenue = 0
}

export interface BankHealthChartPoint {
  metric: string;
  current: number;
  prior: number;
  fullMark: 100;
}

export interface BankHealthData {
  chartData: BankHealthChartPoint[];
  current: AxisContext;
  prior: AxisContext;
  periodLabel: string;
  priorPeriodLabel: string;
}

interface ViewRow {
  visit_date: string;
  payment_method: string | null;
  revenue: number | string | null;
  profit: number | string | null;
  queue_entry_id: string;
  doctor_name: string | null;
}

// View not in generated types — loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function fetchPeriod(startKey: string, endKey: string): Promise<ViewRow[]> {
  const { data, error } = await db
    .from('insight_financials_view')
    .select('visit_date, payment_method, revenue, profit, queue_entry_id, doctor_name')
    .gte('visit_date', startKey)
    .lte('visit_date', endKey);
  if (error) throw error;
  return (data ?? []) as ViewRow[];
}

interface PeriodAggregate {
  revenue: number;
  profit: number;
  liquidRevenue: number;
  patients: Set<string>;
  doctorRevenue: Map<string, number>;
}

function aggregate(rows: ViewRow[]): PeriodAggregate {
  const acc: PeriodAggregate = {
    revenue: 0,
    profit: 0,
    liquidRevenue: 0,
    patients: new Set<string>(),
    doctorRevenue: new Map<string, number>(),
  };

  for (const r of rows) {
    const rev = Number(r.revenue ?? 0);
    const prof = Number(r.profit ?? 0);
    acc.revenue += rev;
    acc.profit += prof;
    acc.patients.add(r.queue_entry_id);

    const method = (r.payment_method ?? '').toLowerCase().trim();
    if (LIQUID_METHODS.has(method)) {
      acc.liquidRevenue += rev;
    }

    const doctor = r.doctor_name ?? 'Unassigned';
    acc.doctorRevenue.set(doctor, (acc.doctorRevenue.get(doctor) ?? 0) + rev);
  }

  return acc;
}

function buildContext(agg: PeriodAggregate, growthPct: number | null): AxisContext {
  let topDoctorName = '—';
  let topRev = 0;
  agg.doctorRevenue.forEach((rev, name) => {
    if (rev > topRev) {
      topRev = rev;
      topDoctorName = name;
    }
  });

  const patientCount = agg.patients.size;
  const profitPerPatient = patientCount > 0 ? agg.profit / patientCount : 0;
  const marginPct = agg.revenue > 0 ? (agg.profit / agg.revenue) * 100 : 0;
  const topDoctorSharePct = agg.revenue > 0 ? (topRev / agg.revenue) * 100 : 0;
  const liquidPct = agg.revenue > 0 ? (agg.liquidRevenue / agg.revenue) * 100 : 0;

  return {
    revenue: agg.revenue,
    profit: agg.profit,
    marginPct,
    topDoctorName,
    topDoctorSharePct,
    profitPerPatient,
    patientCount,
    liquidPct,
    growthPct,
  };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function scoreAxes(ctx: AxisContext) {
  // Profitability: margin % directly (clamped 0..100)
  const profitability = clamp(ctx.marginPct);

  // Risk: 100 - top-doctor share% (high score = well diversified)
  const risk = ctx.revenue > 0 ? clamp(100 - ctx.topDoctorSharePct) : 0;

  // Efficiency: profit/visit vs RM 80 benchmark, capped at 100
  const efficiency = clamp((ctx.profitPerPatient / PROFIT_PER_VISIT_BENCHMARK) * 100);

  // Liquidity: % revenue from instant-cash methods
  const liquidity = clamp(ctx.liquidPct);

  // Growth: −50% → 0, 0% → 50, +50% → 100. Null (no prior data) → 50 (neutral).
  let growth = 50;
  if (ctx.growthPct !== null) {
    const capped = Math.max(-GROWTH_CAP, Math.min(GROWTH_CAP, ctx.growthPct / 100));
    growth = clamp((capped + GROWTH_CAP) / (2 * GROWTH_CAP) * 100);
  }

  return { profitability, risk, efficiency, liquidity, growth };
}

function describePeriod(days: number): string {
  if (days === 1) return 'Selected day';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  if (days === 365) return 'Last 365 days';
  return `Last ${days} days`;
}

function describePriorPeriod(days: number): string {
  if (days === 1) return 'Prior day';
  if (days === 7) return 'Previous 7 days';
  if (days === 30) return 'Previous 30 days';
  if (days === 90) return 'Previous 90 days';
  if (days === 365) return 'Previous 365 days';
  return `Previous ${days} days`;
}

export function useBankHealth(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<BankHealthData>({
    queryKey: ['bank-health', startKey, endKey],
    queryFn: async () => {
      const days = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
      const priorEnd = subDays(startDate, 1);
      const priorStart = subDays(priorEnd, days - 1);
      const priorStartKey = format(priorStart, 'yyyy-MM-dd');
      const priorEndKey = format(priorEnd, 'yyyy-MM-dd');

      const [currentRows, priorRows] = await Promise.all([
        fetchPeriod(startKey, endKey),
        fetchPeriod(priorStartKey, priorEndKey),
      ]);

      const currAgg = aggregate(currentRows);
      const priorAgg = aggregate(priorRows);

      // Growth based on raw revenue
      const growthPct =
        priorAgg.revenue > 0
          ? ((currAgg.revenue - priorAgg.revenue) / priorAgg.revenue) * 100
          : null;

      const current = buildContext(currAgg, growthPct);
      // Prior period's "growth" is undefined here (no period-before-prior fetched), so null.
      const prior = buildContext(priorAgg, null);

      const currScores = scoreAxes(current);
      const priorScores = scoreAxes(prior);

      const chartData: BankHealthChartPoint[] = [
        { metric: 'Profitability', current: currScores.profitability, prior: priorScores.profitability, fullMark: 100 },
        { metric: 'Risk',          current: currScores.risk,          prior: priorScores.risk,          fullMark: 100 },
        { metric: 'Efficiency',    current: currScores.efficiency,    prior: priorScores.efficiency,    fullMark: 100 },
        { metric: 'Liquidity',     current: currScores.liquidity,     prior: priorScores.liquidity,     fullMark: 100 },
        { metric: 'Growth',        current: currScores.growth,        prior: priorScores.growth,        fullMark: 100 },
      ];

      return {
        chartData,
        current,
        prior,
        periodLabel: describePeriod(days),
        priorPeriodLabel: describePriorPeriod(days),
      };
    },
  });
}
