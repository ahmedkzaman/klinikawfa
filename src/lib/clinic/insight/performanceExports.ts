import { csvEscape } from './exports';
import { isTerminalPanelClaim } from './financeSections';
import type {
  InsightPerformanceDoctor,
  InsightPerformanceReport,
  InsightPerformanceService,
} from './performance';
import type { InsightPerformanceFilters } from '@/hooks/clinic/useInsightPerformance';

export const PERFORMANCE_METRIC_DEFINITION_VERSION = 'insight-performance-v1';
const dangerousSpreadsheetPrefix = /^[=+\-@\t\r\n]/;

function performanceCsvEscape(value: string | number | null | undefined): string {
  return csvEscape(typeof value === 'string' && dangerousSpreadsheetPrefix.test(value) ? `'${value}` : value);
}

type PerformanceFinancialRow = {
  visit_date: string;
  queue_entry_id: string;
  payment_method: string | null;
  revenue: number;
};

type PerformancePanelClaim = {
  queue_entry_id?: string | null;
  claim_date?: string | null;
  amount: number | string | null;
  status: string;
};

function collectionCategory(methodValue: string | null): 'card' | 'qrPay' | 'cash' | 'eWallet' | 'other' {
  const method = String(methodValue ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (method === 'card' || method.includes('credit') || method.includes('debit')) return 'card';
  if (method === 'qr_pay' || method.includes('qr') || method.includes('duitnow')) return 'qrPay';
  if (method === 'cash') return 'cash';
  if (method.includes('ewallet') || method.includes('e_wallet') || method.includes('tng') || method.includes('touch')) return 'eWallet';
  return 'other';
}

export function buildPerformanceDailyRevenueCsv(
  rows: PerformanceFinancialRow[],
  panelClaims: PerformancePanelClaim[],
): string[] {
  type DailyTotals = { card: number; qrPay: number; cash: number; eWallet: number; panelBilled: number; other: number };
  const totals = new Map<string, DailyTotals>();
  const getTotals = (date: string) => {
    const existing = totals.get(date);
    if (existing) return existing;
    const next = { card: 0, qrPay: 0, cash: 0, eWallet: 0, panelBilled: 0, other: 0 };
    totals.set(date, next);
    return next;
  };
  const activeClaims = panelClaims.filter((claim) => !isTerminalPanelClaim(claim.status));
  const panelQueueIds = new Set(panelClaims.map((claim) => claim.queue_entry_id).filter(Boolean));

  for (const row of rows) {
    if (panelQueueIds.has(row.queue_entry_id)) continue;
    const daily = getTotals(row.visit_date);
    daily[collectionCategory(row.payment_method)] += Number(row.revenue || 0);
  }
  for (const claim of activeClaims) {
    if (claim.claim_date) getTotals(claim.claim_date).panelBilled += Number(claim.amount ?? 0);
  }

  return [
    'date,card,qr_pay,cash,e_wallet,panel_billed,other_methods,consultation_revenue',
    ...[...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, daily]) => {
      const revenue = daily.card + daily.qrPay + daily.cash + daily.eWallet + daily.panelBilled + daily.other;
      return [
        csvEscape(date), daily.card.toFixed(2), daily.qrPay.toFixed(2), daily.cash.toFixed(2),
        daily.eWallet.toFixed(2), daily.panelBilled.toFixed(2), daily.other.toFixed(2), revenue.toFixed(2),
      ].join(',');
    }),
  ];
}

type PerformanceExportContext = {
  startDate: string;
  endDate: string;
  report: InsightPerformanceReport;
  filters?: InsightPerformanceFilters;
};

const sharedExportFields = ({ startDate, endDate, report, filters }: PerformanceExportContext) => [
  startDate,
  endDate,
  report.generatedAt,
  PERFORMANCE_METRIC_DEFINITION_VERSION,
  report.confidence.state,
  report.quality.missingAttribution,
  report.quality.missingCostCount,
  filters?.doctorId ?? 'all',
  filters?.paymentType ?? 'all',
  filters?.activityType ?? 'all',
  filters?.includeComparison ?? true,
];

export function buildDoctorPerformanceCsv(
  context: PerformanceExportContext,
  doctors: InsightPerformanceDoctor[],
): string[] {
  const header = [
    'start_date', 'end_date', 'generated_at', 'metric_definition_version', 'confidence',
    'missing_attribution_count', 'missing_cost_count',
    'filter_doctor_id', 'filter_payment_type', 'filter_activity_type', 'comparison_enabled',
    'doctor_id', 'doctor_name',
    'completed_visits', 'unique_patients', 'rostered_hours', 'patients_per_hour',
    'visit_billing', 'revenue_per_hour', 'procedures', 'documents', 'doctor_missing_attribution',
  ];
  return [header.join(','), ...doctors.map((doctor) => [
    ...sharedExportFields(context), doctor.doctorId, doctor.doctorName,
    doctor.completedVisits, doctor.uniquePatients, doctor.rosteredHours,
    doctor.patientsPerHour, doctor.visitBilling, doctor.revenuePerHour,
    doctor.procedures, doctor.documents, doctor.missingAttribution,
  ].map(performanceCsvEscape).join(','))];
}

export function buildServicePerformanceCsv(
  context: PerformanceExportContext,
  services: InsightPerformanceService[],
): string[] {
  const header = [
    'start_date', 'end_date', 'generated_at', 'metric_definition_version', 'confidence',
    'missing_attribution_count', 'missing_cost_count',
    'filter_doctor_id', 'filter_payment_type', 'filter_activity_type', 'comparison_enabled',
    'service_id', 'service_name', 'volume',
    'unique_patients', 'revenue', 'cogs', 'profit', 'margin_pct', 'average_price', 'trend_pct',
    'doctor_count', 'service_missing_cost_count',
  ];
  return [header.join(','), ...services.map((service) => [
    ...sharedExportFields(context), service.serviceId, service.serviceName,
    service.volume, service.uniquePatients, service.revenue, service.cogs, service.profit,
    service.marginPct, service.averagePrice, service.trendPct, service.doctorCount,
    service.missingCostCount,
  ].map(performanceCsvEscape).join(','))];
}
