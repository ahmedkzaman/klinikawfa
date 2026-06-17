import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SeasonalTrendRow = {
  diagnosis_group: string;
  calendar_month: number; // 1-12
  total_cases: number;
  years_active: number;
  avg_expected_cases: number;
};

export function useSeasonalTrends() {
  return useQuery({
    queryKey: ['forecasting', 'seasonal-trends'],
    queryFn: async (): Promise<SeasonalTrendRow[]> => {
      const { data, error } = await supabase
        .from('v_seasonal_diagnosis_trends' as never)
        .select('*');
      if (error) throw error;
      return ((data ?? []) as unknown as SeasonalTrendRow[]).map((r) => ({
        ...r,
        calendar_month: Number(r.calendar_month),
        total_cases: Number(r.total_cases),
        years_active: Number(r.years_active),
        avg_expected_cases: Number(r.avg_expected_cases),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Top-N diagnoses ranked by avg_expected_cases for a given month. */
export function topDiagnosesForMonth(
  rows: SeasonalTrendRow[],
  month: number,
  limit = 5,
): SeasonalTrendRow[] {
  return rows
    .filter((r) => r.calendar_month === month && r.diagnosis_group !== 'Uncategorized')
    .sort((a, b) => b.avg_expected_cases - a.avg_expected_cases)
    .slice(0, limit);
}

/** Build a 12-point series for a given diagnosis group, suitable for Recharts. */
export function monthlySeries(
  rows: SeasonalTrendRow[],
  group: string,
): { month: number; avg: number }[] {
  const byMonth = new Map<number, number>();
  for (const r of rows) {
    if (r.diagnosis_group === group) byMonth.set(r.calendar_month, r.avg_expected_cases);
  }
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    avg: byMonth.get(i + 1) ?? 0,
  }));
}

/** Wide-format rows for a multi-line Recharts chart: [{ month: 1, "Asthma": 12, "Dengue": 4 }, ...] */
export function buildChartData(
  rows: SeasonalTrendRow[],
  groups: string[],
): Array<Record<string, number | string>> {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const entry: Record<string, number | string> = { month };
    for (const g of groups) {
      const found = rows.find((r) => r.diagnosis_group === g && r.calendar_month === month);
      entry[g] = found ? found.avg_expected_cases : 0;
    }
    return entry;
  });
}

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
