import { useQuery } from '@tanstack/react-query';
import { differenceInYears, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// View not in generated types — same loose-cast pattern as useScoreboards.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ViewRow {
  patient_id: string | null;
  patient_reg_no: string | null;
  revenue: number | string | null;
  profit: number | string | null;
  visit_date: string | null;
  queue_entry_id: string;
}

export interface LtvHistogramBucket {
  name: string;
  count: number;
}

export interface VipPatientRow {
  patient_id: string;
  reg_no: string | null;
  visitCount: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface PatientLtvData {
  histogramData: LtvHistogramBucket[];
  medianLTV: number;
  activeCount: number;
  inactiveCount: number;
  top50: VipPatientRow[];
}

const INACTIVE_YEARS = 3;

const BUCKET_DEFS: Array<{ name: string; max: number | null }> = [
  { name: 'RM 0–200', max: 200 },
  { name: 'RM 201–500', max: 500 },
  { name: 'RM 501–1,000', max: 1000 },
  { name: 'RM 1,001–2,500', max: 2500 },
  { name: 'RM 2,500+', max: null },
];

function bucketIndexFor(revenue: number): number {
  for (let i = 0; i < BUCKET_DEFS.length; i += 1) {
    const max = BUCKET_DEFS[i].max;
    if (max === null || revenue <= max) return i;
  }
  return BUCKET_DEFS.length - 1;
}

export function usePatientLTV() {
  return useQuery<PatientLtvData>({
    queryKey: ['patient-ltv'],
    queryFn: async () => {
      const { data, error } = await db
        .from('insight_financials_view')
        .select('patient_id, patient_reg_no, revenue, profit, visit_date, queue_entry_id');

      if (error) throw error;

      const rows: ViewRow[] = (data ?? []) as ViewRow[];

      // Aggregate per patient
      type PatientAcc = {
        patientId: string;
        regNo: string | null;
        totalRevenue: number;
        totalProfit: number;
        lastVisit: string;
        visits: Set<string>;
      };
      const patientMap = new Map<string, PatientAcc>();

      for (const r of rows) {
        if (!r.patient_id || !r.visit_date) continue;
        const acc =
          patientMap.get(r.patient_id) ??
          ({
            patientId: r.patient_id,
            regNo: r.patient_reg_no ?? null,
            totalRevenue: 0,
            totalProfit: 0,
            lastVisit: r.visit_date,
            visits: new Set<string>(),
          } as PatientAcc);

        acc.totalRevenue += Number(r.revenue ?? 0);
        acc.totalProfit += Number(r.profit ?? 0);
        acc.visits.add(r.queue_entry_id);
        if (r.visit_date > acc.lastVisit) acc.lastVisit = r.visit_date;
        // reg_no may arrive on later rows if first one was null
        if (!acc.regNo && r.patient_reg_no) acc.regNo = r.patient_reg_no;

        patientMap.set(r.patient_id, acc);
      }

      // Recency filter
      const now = new Date();
      const active: PatientAcc[] = [];
      let inactiveCount = 0;
      for (const acc of patientMap.values()) {
        const isInactive =
          differenceInYears(now, parseISO(acc.lastVisit)) >= INACTIVE_YEARS;
        if (isInactive) inactiveCount += 1;
        else active.push(acc);
      }

      // Bucket distribution
      const counts = new Array(BUCKET_DEFS.length).fill(0) as number[];
      for (const p of active) {
        counts[bucketIndexFor(p.totalRevenue)] += 1;
      }
      const histogramData: LtvHistogramBucket[] = BUCKET_DEFS.map(
        (def, i) => ({ name: def.name, count: counts[i] }),
      );

      // Median active LTV (by revenue)
      let medianLTV = 0;
      if (active.length > 0) {
        const sorted = [...active].sort(
          (a, b) => a.totalRevenue - b.totalRevenue,
        );
        medianLTV = sorted[Math.floor(sorted.length / 2)].totalRevenue;
      }

      // Top 50 active VIPs by total revenue
      const top50: VipPatientRow[] = [...active]
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 50)
        .map((p) => ({
          patient_id: p.patientId,
          reg_no: p.regNo,
          visitCount: p.visits.size,
          totalRevenue: p.totalRevenue,
          totalProfit: p.totalProfit,
        }));

      return {
        histogramData,
        medianLTV,
        activeCount: active.length,
        inactiveCount,
        top50,
      };
    },
  });
}
