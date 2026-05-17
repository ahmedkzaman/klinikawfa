import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MovementStatus = 'fast' | 'normal' | 'slow' | 'dead';

export type InventoryMovementStat = {
  item_id: string;
  name: string;
  current_stock: number;
  reorder_level: number;
  used_30d: number;
  used_90d: number;
  avg_daily_usage: number;
  /** Null = infinite (no usage in 90 days) */
  days_cover: number | null;
  movement_status: MovementStatus;
  last_dispensed_at: string | null;
};

export function useProcurementStats() {
  return useQuery({
    queryKey: ['procurement', 'movement-stats'],
    queryFn: async (): Promise<InventoryMovementStat[]> => {
      const { data, error } = await supabase
        .from('v_inventory_movement_stats' as never)
        .select('*')
        .order('used_30d', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InventoryMovementStat[];
    },
    staleTime: 60_000,
  });
}

export type InventoryTxType =
  | 'restock'
  | 'dispense'
  | 'adjustment'
  | 'return'
  | 'write-off'
  | 'expire'
  | 'owe_slip_fulfilled';

export type StockMovementRow = {
  id: string;
  created_at: string;
  transaction_type: InventoryTxType;
  qty_change: number;
  reason_code: string | null;
  notes: string | null;
  performed_by: string | null;
  inventory_item_id: string;
  inventory_item: { name: string } | null;
};

export function useStockMovements(opts: {
  limit?: number;
  itemId?: string | null;
  type?: InventoryTxType | null;
} = {}) {
  const { limit = 100, itemId, type } = opts;
  return useQuery({
    queryKey: ['procurement', 'movements', { limit, itemId, type }],
    queryFn: async (): Promise<StockMovementRow[]> => {
      let q = supabase
        .from('inventory_transactions')
        .select('id, created_at, transaction_type, qty_change, reason_code, notes, performed_by, inventory_item_id, inventory_item:inventory_items(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (itemId) q = q.eq('inventory_item_id', itemId);
      if (type) q = q.eq('transaction_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StockMovementRow[];
    },
    staleTime: 30_000,
  });
}

/* ───────────────────────── Stage 3 & 4: Correlation & Recommendations ───────────────────────── */

export type DiagnosisCorrelationRow = {
  diagnosis_group: string;
  inventory_item_id: string;
  item_name: string | null;
  case_count_current_month: number;
  case_count_prior_month: number;
  case_trend_pct: number | null;
  item_usage_count: number;
  co_occurrence_cases: number;
  total_cases_for_group_90d: number;
  total_cases_with_item_90d: number;
  total_cases_90d: number;
  confidence_pct: number | null;
  lift_score: number | null;
  last_refreshed_at: string;
};

export function useDiagnosisCorrelation(opts: { minLift?: number; includeUnlinked?: boolean } = {}) {
  const { minLift = 0, includeUnlinked = false } = opts;
  return useQuery({
    queryKey: ['procurement', 'correlation', { minLift, includeUnlinked }],
    queryFn: async (): Promise<DiagnosisCorrelationRow[]> => {
      const { data, error } = await supabase
        .from('v_diagnosis_stock_correlation' as never)
        .select('*');
      if (error) throw error;
      const rows = ((data ?? []) as unknown as DiagnosisCorrelationRow[])
        .filter((r) => includeUnlinked || r.diagnosis_group !== '__UNLINKED__')
        .filter((r) => (r.lift_score ?? 0) >= minLift)
        .sort((a, b) => (b.lift_score ?? -1) - (a.lift_score ?? -1));
      return rows;
    },
    staleTime: 60_000,
  });
}

export function useRefreshCorrelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_diagnosis_correlation' as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement', 'correlation'] });
      qc.invalidateQueries({ queryKey: ['procurement', 'movement-stats'] });
    },
  });
}

export type UrgentRec = {
  kind: 'urgent';
  item_id: string;
  item_name: string;
  days_cover: number;
  avg_daily_usage: number;
  current_stock: number;
  suggested_qty: number;
};
export type SurgeRec = {
  kind: 'surge';
  item_id: string;
  item_name: string;
  diagnosis_group: string;
  trend_pct: number;
  lift_score: number;
  days_cover: number | null;
  suggested_qty: number;
};
export type OverstockRec = {
  kind: 'overstock';
  item_id: string;
  item_name: string;
  current_stock: number;
};
export type Recommendations = { urgent: UrgentRec[]; surge: SurgeRec[]; overstock: OverstockRec[] };

export type RecommendationThresholds = {
  urgentDays: number;
  surgeTrendPct: number;
  surgeLift: number;
  surgeDaysCover: number;
  deadStockDays: number;
};

export const DEFAULT_THRESHOLDS: RecommendationThresholds = {
  urgentDays: 7,
  surgeTrendPct: 20,
  surgeLift: 1.5,
  surgeDaysCover: 30,
  deadStockDays: 90,
};

export function useProcurementRecommendations(
  thresholds: Partial<RecommendationThresholds> = {},
): {
  data: Recommendations;
  isLoading: boolean;
} {
  const t: RecommendationThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const { data: stats = [], isLoading: a } = useProcurementStats();
  const { data: corr = [], isLoading: b } = useDiagnosisCorrelation({ minLift: t.surgeLift });

  const urgent: UrgentRec[] = stats
    .filter((s) => s.movement_status === 'fast' && s.days_cover != null && Number(s.days_cover) < t.urgentDays)
    .map((s) => ({
      kind: 'urgent',
      item_id: s.item_id,
      item_name: s.name,
      days_cover: Number(s.days_cover),
      avg_daily_usage: Number(s.avg_daily_usage),
      current_stock: Number(s.current_stock),
      suggested_qty: Math.max(
        Math.ceil(Number(s.avg_daily_usage) * 30) - Number(s.current_stock),
        1,
      ),
    }));

  const statsById = new Map(stats.map((s) => [s.item_id, s]));
  const surge: SurgeRec[] = corr
    .filter((c) => (c.case_trend_pct ?? 0) > t.surgeTrendPct && (c.lift_score ?? 0) > t.surgeLift)
    .map((c) => {
      const s = statsById.get(c.inventory_item_id);
      const dc = s?.days_cover == null ? null : Number(s.days_cover);
      if (dc == null || dc >= t.surgeDaysCover) return null;
      return {
        kind: 'surge' as const,
        item_id: c.inventory_item_id,
        item_name: c.item_name ?? s?.name ?? '—',
        diagnosis_group: c.diagnosis_group,
        trend_pct: Number(c.case_trend_pct),
        lift_score: Number(c.lift_score),
        days_cover: dc,
        suggested_qty: Math.max(Math.ceil(Number(s?.avg_daily_usage ?? 0) * 30) - Number(s?.current_stock ?? 0), 1),
      };
    })
    .filter((x): x is SurgeRec => x !== null);

  const overstock: OverstockRec[] = stats
    .filter((s) => s.movement_status === 'dead' && Number(s.current_stock) > 0)
    .map((s) => ({
      kind: 'overstock',
      item_id: s.item_id,
      item_name: s.name,
      current_stock: Number(s.current_stock),
    }));

  return { data: { urgent, surge, overstock }, isLoading: a || b };
}
