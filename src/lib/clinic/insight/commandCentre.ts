import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';
import type {
  FinancialControlAlert,
  FinancialControlAlertKey,
  FinancialControlAlertSeverity,
} from '@/lib/clinic/financialControl';
import {
  FINANCIAL_CONTROL_ALERT_KEYS,
  FINANCIAL_CONTROL_METRICS,
  type FinancialControlMetric,
} from '@/lib/clinic/financialControl';
import type { ClinicHealthAlert } from './alerts';
import { evaluateDataConfidence, type DataConfidence } from './dataConfidence';

export type CommandActionGroup = 'Money' | 'Panels' | 'Billing' | 'Clinical records' | 'Inventory';
export type CommandActionSeverity = FinancialControlAlertSeverity | 'warning' | 'info';

export type CommandAction = {
  key: string;
  group: CommandActionGroup;
  severity: CommandActionSeverity;
  title: string;
  count: number;
  amount: number | null;
  oldestDate: string | null;
  href: string;
  confidence: DataConfidence;
};

export type CommandAttendancePeriod = {
  key: '08_12' | '12_16' | '16_20' | '20_24';
  label: '08:00–12:00' | '12:00–16:00' | '16:00–20:00' | '20:00–00:00';
  visits: number;
  averageWaitingMinutes: number | null;
};

type AttendanceCell = Pick<AttendanceHeatmapCell, 'weekday' | 'hour' | 'totalVisits' | 'averageWaitMinutes' | 'waitMeasuredVisits'>;

type CommandActionInput = {
  financialAlerts?: FinancialControlAlert[];
  clinicAlerts?: ClinicHealthAlert[];
  asOfDate?: string;
  lastRefreshedAt?: string | null;
  unpaidSelfPay?: number;
  overduePanel?: number;
  clinicSourceFailed?: boolean;
  financialSourceFailed?: boolean;
};

export type CommandFinanceDetailQuery = {
  metric: FinancialControlMetric;
  alert: FinancialControlAlertKey | null;
};

export function commandFinanceDetailHref(query: CommandFinanceDetailQuery): string {
  const params = new URLSearchParams({ section: 'finance', metric: query.metric });
  if (query.alert) params.set('alert', query.alert);
  return `/clinic/insight?${params.toString()}`;
}

export function parseCommandFinanceDetail(search: string): CommandFinanceDetailQuery | null {
  const params = new URLSearchParams(search);
  if (params.get('section') !== 'finance') return null;
  if (params.has('collection')) return null;
  const metric = params.get('metric');
  if (!FINANCIAL_CONTROL_METRICS.includes(metric as FinancialControlMetric)) return null;
  const alert = params.get('alert');
  if (alert === null) return { metric: metric as FinancialControlMetric, alert: null };
  if (metric !== 'alerts' || !FINANCIAL_CONTROL_ALERT_KEYS.includes(alert as FinancialControlAlertKey)) return null;
  return { metric: 'alerts', alert: alert as FinancialControlAlertKey };
}

const FINANCIAL_ACTIONS: Record<FinancialControlAlertKey, { group: CommandActionGroup; title: string }> = {
  unpaid_self_pay: { group: 'Money', title: 'Unpaid self-pay bills' },
  unsubmitted_panel: { group: 'Panels', title: 'Unsubmitted panel claims' },
  overdue_panel: { group: 'Panels', title: 'Overdue panel claims' },
  missing_cost: { group: 'Billing', title: 'Bills with missing costs' },
  zero_price: { group: 'Billing', title: 'Zero-price billing lines' },
  negative_margin: { group: 'Billing', title: 'Negative-margin bills' },
  large_discount: { group: 'Billing', title: 'Large discounts' },
  refund_void_correction: { group: 'Money', title: 'Refund, void, or correction activity' },
  payment_mismatch: { group: 'Money', title: 'Payment mismatches' },
  duplicate_or_excess_payment: { group: 'Money', title: 'Possible duplicate or excess payments' },
};

const CLINIC_GROUPS: Record<string, CommandActionGroup> = {
  'overdue-claims': 'Panels',
  'missing-panel-fees': 'Panels',
  'out-of-stock': 'Inventory',
  'missing-payment': 'Clinical records',
};

function dateBefore(asOfDate: string | undefined, days: number): string | null {
  if (!asOfDate) return null;
  const value = new Date(`${asOfDate}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() - Math.max(0, Math.trunc(days)));
  return value.toISOString().slice(0, 10);
}

function financialAction(alert: FinancialControlAlert, input: CommandActionInput): CommandAction {
  const presentation = FINANCIAL_ACTIONS[alert.key];
  return {
    key: alert.key,
    group: presentation.group,
    severity: alert.severity,
    title: presentation.title,
    count: alert.count,
    amount: alert.amount,
    oldestDate: dateBefore(input.asOfDate, alert.oldestAgeDays),
    href: commandFinanceDetailHref({ metric: 'alerts', alert: alert.key }),
    confidence: evaluateDataConfidence({
      expectedRows: alert.count,
      observedRows: Math.max(alert.count - alert.incompleteRows, 0),
      missingAttributionRows: alert.incompleteRows,
      lastRefreshedAt: input.lastRefreshedAt ?? null,
      source: 'financial-control',
      dateBasis: 'Visit completion and financial event dates in Asia/Kuala_Lumpur',
      sourceFailed: input.financialSourceFailed,
    }),
  };
}

function shorthandAlerts(input: CommandActionInput): FinancialControlAlert[] {
  return [
    { key: 'unpaid_self_pay', count: input.unpaidSelfPay ?? 0 },
    { key: 'overdue_panel', count: input.overduePanel ?? 0 },
  ].map(({ key, count }) => ({
    key: key as FinancialControlAlertKey,
    severity: key === 'overdue_panel' ? 'critical' : 'high',
    count,
    amount: 0,
    oldestAgeDays: 0,
    attributionComplete: true,
    incompleteRows: 0,
  }));
}

export function buildCommandActions(input: CommandActionInput): CommandAction[] {
  const financialAlerts = input.financialAlerts ?? shorthandAlerts(input);
  const actions = financialAlerts.filter((alert) => alert.count > 0).map((alert) => financialAction(alert, input));
  const hasFinancialOverduePanel = financialAlerts.some((alert) => alert.key === 'overdue_panel' && alert.count > 0);

  for (const alert of input.clinicAlerts ?? []) {
    const count = Math.max(0, Math.trunc(alert.count ?? 0));
    if (count === 0 || (alert.id === 'overdue-claims' && hasFinancialOverduePanel)) continue;
    actions.push({
      key: alert.id,
      group: CLINIC_GROUPS[alert.id] ?? 'Clinical records',
      severity: alert.severity,
      title: alert.title,
      count,
      amount: null,
      oldestDate: null,
      href: alert.href,
      confidence: evaluateDataConfidence({
        expectedRows: count,
        observedRows: count,
        missingAttributionRows: 0,
        lastRefreshedAt: input.lastRefreshedAt ?? null,
        source: 'clinic-health',
        dateBasis: 'Queue entry registration date in Asia/Kuala_Lumpur',
        sourceFailed: input.clinicSourceFailed,
      }),
    });
  }

  const severityRank: Record<CommandActionSeverity, number> = {
    critical: 0, high: 1, warning: 2, medium: 2, low: 3, info: 4,
  };
  return actions.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
    || right.count - left.count || left.title.localeCompare(right.title));
}

const ATTENDANCE_PERIODS = [
  { key: '08_12', label: '08:00–12:00', start: 8, end: 12 },
  { key: '12_16', label: '12:00–16:00', start: 12, end: 16 },
  { key: '16_20', label: '16:00–20:00', start: 16, end: 20 },
  { key: '20_24', label: '20:00–00:00', start: 20, end: 24 },
] as const;

export function buildAttendanceSummary(cells: AttendanceCell[]): CommandAttendancePeriod[] {
  return ATTENDANCE_PERIODS.map((period) => {
    const periodCells = cells.filter((cell) => cell.hour >= period.start && cell.hour < period.end);
    const measuredVisits = periodCells.reduce((total, cell) => total + cell.waitMeasuredVisits, 0);
    const weightedWait = periodCells.reduce((total, cell) => (
      total + (cell.averageWaitMinutes ?? 0) * cell.waitMeasuredVisits
    ), 0);
    return {
      key: period.key,
      label: period.label,
      visits: periodCells.reduce((total, cell) => total + cell.totalVisits, 0),
      averageWaitingMinutes: measuredVisits === 0 ? null : weightedWait / measuredVisits,
    };
  });
}

export function attendanceAverageWaiting(cells: AttendanceCell[]): number | null {
  const measuredVisits = cells.reduce((total, cell) => total + cell.waitMeasuredVisits, 0);
  if (measuredVisits === 0) return null;
  return cells.reduce((total, cell) => total + (cell.averageWaitMinutes ?? 0) * cell.waitMeasuredVisits, 0)
    / measuredVisits;
}
