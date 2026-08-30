import { z } from 'zod';

export type BudgetCategory = 'medicines' | 'consumables' | 'vaccines' | 'other';
export type ProcurementActionKind = 'stockout' | 'overdue' | 'approval' | 'follow_up' | 'expiry';
export type POStatus = 'Draft' | 'Awaiting approval' | 'Ordered' | 'Received' | 'Cancelled';

export type ProcurementAction = {
  id: string;
  kind: ProcurementActionKind;
  title: string;
  dueDate: string | null;
  poId: string | null;
  itemId: string | null;
};

export type ProcurementBudgetRow = {
  category: BudgetCategory;
  budget: number;
  committed: number;
  received: number;
  remaining: number;
};

export type ProcurementDashboardReport = {
  month: string;
  budgetRows: ProcurementBudgetRow[];
  totals: Omit<ProcurementBudgetRow, 'category'>;
  counts: {
    stockoutRisk: number;
    awaitingApproval: number;
    awaitingDelivery: number;
    overdue: number;
    expiringSoon: number;
  };
  actions: ProcurementAction[];
};

export type StockPlanningRow = {
  item_id: string;
  name: string;
  category: string;
  current_stock: number;
  reorder_level: number;
  used_30d: number;
  avg_daily_usage: number;
  days_cover: number | null;
  movement_status: 'fast' | 'normal' | 'slow' | 'dead';
  open_order_qty: number;
  supplier_lead_time_days: number;
  nearest_expiry_date: string | null;
  suggested_qty: number | null;
  recommendation_reason: string;
};

const BUDGET_CATEGORIES: BudgetCategory[] = ['medicines', 'consumables', 'vaccines', 'other'];

const ACTION_PRIORITY: Record<ProcurementActionKind, number> = {
  stockout: 0,
  overdue: 1,
  approval: 2,
  follow_up: 3,
  expiry: 4,
};

const finiteNumber = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return Number.NaN;
    return Number(trimmed);
  }
  if (typeof value === 'number') return value;
  return Number.NaN;
}, z.number().refine((n) => Number.isFinite(n), { message: 'non-finite number' }));

const nullableFiniteNumber = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'number') return value;
  return Number.NaN;
}, z.number().refine((n) => Number.isFinite(n), { message: 'non-finite number' }).nullable());

const nullableString = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null || v === '' ? null : v));

const budgetCategorySchema = z.enum(['medicines', 'consumables', 'vaccines', 'other']);

const budgetRowSchema = z.object({
  category: budgetCategorySchema,
  budget: finiteNumber,
  committed: finiteNumber,
  received: finiteNumber,
  remaining: finiteNumber,
});

const actionKindSchema = z.enum(['stockout', 'overdue', 'approval', 'follow_up', 'expiry']);

const actionSchema = z.object({
  id: z.string().min(1),
  kind: actionKindSchema,
  title: z.string(),
  dueDate: nullableString,
  poId: nullableString,
  itemId: nullableString,
});

const countsSchema = z.object({
  stockoutRisk: finiteNumber,
  awaitingApproval: finiteNumber,
  awaitingDelivery: finiteNumber,
  overdue: finiteNumber,
  expiringSoon: finiteNumber,
});

const reportSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetRows: z.array(budgetRowSchema),
  totals: z.object({
    budget: finiteNumber,
    committed: finiteNumber,
    received: finiteNumber,
    remaining: finiteNumber,
  }),
  counts: countsSchema,
  actions: z.array(actionSchema),
});

export function budgetCategoryLabel(category: BudgetCategory): string {
  const labels: Record<BudgetCategory, string> = {
    medicines: 'Medicines',
    consumables: 'Consumables',
    vaccines: 'Vaccines',
    other: 'Other',
  };
  return labels[category];
}

export function budgetCategoryList(): BudgetCategory[] {
  return [...BUDGET_CATEGORIES];
}

/**
 * Parse and validate the JSON returned by the get_procurement_dashboard RPC.
 * Throws 'Invalid procurement dashboard response' rather than ever showing
 * fabricated zero totals for malformed data.
 */
export function parseProcurementDashboardReport(payload: unknown): ProcurementDashboardReport {
  const result = reportSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('Invalid procurement dashboard response');
  }
  const data = result.data;
  return {
    month: data.month,
    budgetRows: data.budgetRows,
    totals: data.totals,
    counts: {
      stockoutRisk: data.counts.stockoutRisk,
      awaitingApproval: data.counts.awaitingApproval,
      awaitingDelivery: data.counts.awaitingDelivery,
      overdue: data.counts.overdue,
      expiringSoon: data.counts.expiringSoon,
    },
    actions: data.actions,
  };
}

export function sortProcurementActions(actions: ProcurementAction[]): ProcurementAction[] {
  return [...actions].sort((a, b) => {
    const pa = ACTION_PRIORITY[a.kind];
    const pb = ACTION_PRIORITY[b.kind];
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}
