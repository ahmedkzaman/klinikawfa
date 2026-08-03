import { differenceInCalendarDays, format, isValid, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export const FINANCIAL_CONTROL_METRICS = [
  'billed_revenue',
  'cash_collected',
  'cohort_outstanding',
  'total_outstanding',
  'cogs',
  'gross_profit',
  'adjustments',
  'alerts',
  'margin',
] as const;

export const FINANCIAL_CONTROL_GROUPINGS = [
  'visit',
  'medicine',
  'procedure',
  'package',
  'doctor',
  'payment_type',
  'panel_provider',
] as const;

export const FINANCIAL_CONTROL_ALERT_KEYS = [
  'unpaid_self_pay',
  'unsubmitted_panel',
  'overdue_panel',
  'missing_cost',
  'zero_price',
  'negative_margin',
  'large_discount',
  'refund_void_correction',
  'payment_mismatch',
  'duplicate_or_excess_payment',
] as const;

export type FinancialControlMetric = (typeof FINANCIAL_CONTROL_METRICS)[number];
export type FinancialControlGroupBy = (typeof FINANCIAL_CONTROL_GROUPINGS)[number];
export type FinancialControlAlertKey = (typeof FINANCIAL_CONTROL_ALERT_KEYS)[number];
export type FinancialControlAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface FinancialControlPeriodSummary {
  billedRevenue: number | null;
  cashCollected: number | null;
  cohortCollected: number | null;
  olderDebtCollected: number | null;
  collectionRate: number | null;
  cogs: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
  cohortOutstanding: number | null;
  totalOutstanding: number | null;
  averageBill: number | null;
  completedVisits: number;
  attributionComplete: boolean;
  costComplete: boolean;
  incompleteVisits: number;
  missingCostItems: number;
}

export interface FinancialControlReconciliation {
  billedCohort: number | null;
  cashCollected: number;
  cohortCollected: number | null;
  olderDebtCollected: number;
  discounts: number;
  taxes: number;
  refunds: number;
  adjustments: number;
  corrections: number;
  cohortOutstanding: number | null;
  selfPayOutstanding: number;
  panelOutstanding: number;
  totalOutstanding: number;
  attributionComplete: boolean;
  incompleteVisits: number;
}

export interface FinancialControlAlert {
  key: FinancialControlAlertKey;
  severity: FinancialControlAlertSeverity;
  count: number;
  amount: number;
  oldestAgeDays: number;
  attributionComplete: boolean;
  incompleteRows: number;
}

export interface FinancialControlSummary {
  period: FinancialControlPeriodSummary;
  comparison: FinancialControlPeriodSummary;
  reconciliation: FinancialControlReconciliation;
  alerts: FinancialControlAlert[];
  generated_at: string;
}

export interface FinancialControlDetailRow {
  queueEntryId: string | null;
  consultationId: string | null;
  completedDate: string | null;
  patientName: string | null;
  doctorName: string | null;
  paymentType: string | null;
  paymentMethod: string | null;
  panelProviderName: string | null;
  claimStatus: string | null;
  claimCreatedDate: string | null;
  claimDueDate: string | null;
  groupKey: string;
  groupLabel: string;
  billed: number | null;
  paid: number | null;
  paidInPeriod: number | null;
  outstanding: number | null;
  cogs: number | null;
  profit: number | null;
  marginPct: number | null;
  discount: number | null;
  tax: number | null;
  refund: number | null;
  corrections: number;
  missingCostCount: number;
  zeroPriceCount: number;
  amount: number | null;
  alertKeys: FinancialControlAlertKey[];
  attributionComplete: boolean;
  costComplete: boolean;
  visitCount: number;
}

export interface FinancialControlDetailTotals {
  billed: number | null;
  paid: number | null;
  outstanding: number | null;
  cogs: number | null;
  profit: number | null;
  attributionComplete: boolean;
  costComplete: boolean;
  incompleteRows: number;
}

export interface FinancialControlDetailResponse {
  rows: FinancialControlDetailRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: FinancialControlDetailTotals;
}

export interface FinancialControlDetailFilters {
  startDate: Date;
  endDate: Date;
  metric: FinancialControlMetric;
  groupBy: FinancialControlGroupBy;
  alertKey: FinancialControlAlertKey | null;
  page: number;
  pageSize: number;
}

export interface FinancialControlSummaryArguments {
  _start_date: string;
  _end_date: string;
  _comparison_start: string;
  _comparison_end: string;
  _as_of_date: string;
}

export interface FinancialControlDetailArguments {
  _start_date: string;
  _end_date: string;
  _as_of_date: string;
  _metric: FinancialControlMetric;
  _group_by: FinancialControlGroupBy;
  _alert_key: FinancialControlAlertKey | null;
  _page: number;
  _page_size: number;
}

const INVALID_RESPONSE_MESSAGE = 'Invalid financial control response';
const MAX_DATE_DIFFERENCE_DAYS = 365;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isMetric(value: unknown): value is FinancialControlMetric {
  return FINANCIAL_CONTROL_METRICS.includes(value as FinancialControlMetric);
}

function isGroupBy(value: unknown): value is FinancialControlGroupBy {
  return FINANCIAL_CONTROL_GROUPINGS.includes(value as FinancialControlGroupBy);
}

function isAlertKey(value: unknown): value is FinancialControlAlertKey {
  return FINANCIAL_CONTROL_ALERT_KEYS.includes(value as FinancialControlAlertKey);
}

function isAlertSeverity(value: unknown): value is FinancialControlAlertSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low';
}

function hasNullableNumber(record: Record<string, unknown>, key: string): boolean {
  return hasOwn(record, key) && isNullableNumber(record[key]);
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return hasOwn(record, key) && isFiniteNumber(record[key]);
}

function hasInteger(record: Record<string, unknown>, key: string, minimum = 0): boolean {
  return hasOwn(record, key) && isIntegerAtLeast(record[key], minimum);
}

function hasBoolean(record: Record<string, unknown>, key: string): boolean {
  return hasOwn(record, key) && typeof record[key] === 'boolean';
}

function isPeriodSummary(value: unknown): value is FinancialControlPeriodSummary {
  if (!isRecord(value)) return false;

  return [
    'billedRevenue',
    'cashCollected',
    'cohortCollected',
    'olderDebtCollected',
    'collectionRate',
    'cogs',
    'grossProfit',
    'grossMarginPct',
    'cohortOutstanding',
    'totalOutstanding',
    'averageBill',
  ].every((key) => hasNullableNumber(value, key))
    && hasInteger(value, 'completedVisits')
    && hasBoolean(value, 'attributionComplete')
    && hasBoolean(value, 'costComplete')
    && hasInteger(value, 'incompleteVisits')
    && hasInteger(value, 'missingCostItems');
}

function isReconciliation(value: unknown): value is FinancialControlReconciliation {
  if (!isRecord(value)) return false;

  return hasNullableNumber(value, 'billedCohort')
    && hasNumber(value, 'cashCollected')
    && hasNullableNumber(value, 'cohortCollected')
    && hasNumber(value, 'olderDebtCollected')
    && hasNumber(value, 'discounts')
    && hasNumber(value, 'taxes')
    && hasNumber(value, 'refunds')
    && hasNumber(value, 'adjustments')
    && hasInteger(value, 'corrections')
    && hasNullableNumber(value, 'cohortOutstanding')
    && hasNumber(value, 'selfPayOutstanding')
    && hasNumber(value, 'panelOutstanding')
    && hasNumber(value, 'totalOutstanding')
    && hasBoolean(value, 'attributionComplete')
    && hasInteger(value, 'incompleteVisits');
}

function isAlert(value: unknown): value is FinancialControlAlert {
  if (!isRecord(value)) return false;

  return isAlertKey(value.key)
    && isAlertSeverity(value.severity)
    && hasInteger(value, 'count')
    && hasNumber(value, 'amount')
    && hasInteger(value, 'oldestAgeDays')
    && hasBoolean(value, 'attributionComplete')
    && hasInteger(value, 'incompleteRows');
}

function invalidResponse(): never {
  throw new Error(INVALID_RESPONSE_MESSAGE);
}

export function parseFinancialControlSummary(value: unknown): FinancialControlSummary {
  if (!isRecord(value)
      || !isPeriodSummary(value.period)
      || !isPeriodSummary(value.comparison)
      || !isReconciliation(value.reconciliation)
      || !Array.isArray(value.alerts)
      || !value.alerts.every(isAlert)
      || typeof value.generated_at !== 'string') {
    return invalidResponse();
  }

  return value as unknown as FinancialControlSummary;
}

function optionalNullableString(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || isNullableString(record[key]);
}

function optionalNullableNumber(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || isNullableNumber(record[key]);
}

function parseDetailRow(value: unknown): FinancialControlDetailRow {
  if (!isRecord(value)
      || !hasOwn(value, 'queueEntryId') || !isNullableString(value.queueEntryId)
      || !hasOwn(value, 'consultationId') || !isNullableString(value.consultationId)
      || !hasOwn(value, 'completedDate') || !isNullableString(value.completedDate)
      || !hasOwn(value, 'patientName') || !isNullableString(value.patientName)
      || !hasOwn(value, 'doctorName') || !isNullableString(value.doctorName)
      || !hasOwn(value, 'paymentType') || !isNullableString(value.paymentType)
      || !hasOwn(value, 'paymentMethod') || !isNullableString(value.paymentMethod)
      || !hasOwn(value, 'panelProviderName') || !isNullableString(value.panelProviderName)
      || !optionalNullableString(value, 'claimStatus')
      || !optionalNullableString(value, 'claimCreatedDate')
      || !optionalNullableString(value, 'claimDueDate')
      || typeof value.groupKey !== 'string'
      || typeof value.groupLabel !== 'string'
      || !hasNullableNumber(value, 'billed')
      || !hasNullableNumber(value, 'paid')
      || !optionalNullableNumber(value, 'paidInPeriod')
      || !hasNullableNumber(value, 'outstanding')
      || !hasNullableNumber(value, 'cogs')
      || !hasNullableNumber(value, 'profit')
      || !hasNullableNumber(value, 'marginPct')
      || !hasNullableNumber(value, 'discount')
      || !hasNullableNumber(value, 'tax')
      || !hasNullableNumber(value, 'refund')
      || !hasInteger(value, 'corrections')
      || !hasInteger(value, 'missingCostCount')
      || !hasInteger(value, 'zeroPriceCount')
      || !hasNullableNumber(value, 'amount')
      || !Array.isArray(value.alertKeys) || !value.alertKeys.every(isAlertKey)
      || !hasBoolean(value, 'attributionComplete')
      || !hasBoolean(value, 'costComplete')
      || !hasInteger(value, 'visitCount')) {
    return invalidResponse();
  }

  return {
    ...(value as unknown as FinancialControlDetailRow),
    claimStatus: (value.claimStatus as string | null | undefined) ?? null,
    claimCreatedDate: (value.claimCreatedDate as string | null | undefined) ?? null,
    claimDueDate: (value.claimDueDate as string | null | undefined) ?? null,
    paidInPeriod: (value.paidInPeriod as number | null | undefined) ?? null,
  };
}

function isDetailTotals(value: unknown): value is FinancialControlDetailTotals {
  if (!isRecord(value)) return false;

  return hasNullableNumber(value, 'billed')
    && hasNullableNumber(value, 'paid')
    && hasNullableNumber(value, 'outstanding')
    && hasNullableNumber(value, 'cogs')
    && hasNullableNumber(value, 'profit')
    && hasBoolean(value, 'attributionComplete')
    && hasBoolean(value, 'costComplete')
    && hasInteger(value, 'incompleteRows');
}

export function parseFinancialControlDetails(value: unknown): FinancialControlDetailResponse {
  if (!isRecord(value)
      || !Array.isArray(value.rows)
      || !hasInteger(value, 'total')
      || !hasInteger(value, 'page', 1)
      || !hasInteger(value, 'pageSize', 1)
      || (value.pageSize as number) > 100
      || !isDetailTotals(value.totals)) {
    return invalidResponse();
  }

  return {
    rows: value.rows.map(parseDetailRow),
    total: value.total as number,
    page: value.page as number,
    pageSize: value.pageSize as number,
    totals: value.totals,
  };
}

export function isValidFinancialControlDateRange(startDate: unknown, endDate: unknown): boolean {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)
      || !isValid(startDate) || !isValid(endDate)) {
    return false;
  }

  const difference = differenceInCalendarDays(endDate, startDate);
  return difference >= 0 && difference <= MAX_DATE_DIFFERENCE_DAYS;
}

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getFinancialControlSummaryArguments(
  range: DateRange,
): FinancialControlSummaryArguments | null {
  if (!isValidFinancialControlDateRange(range.from, range.to)) return null;

  const periodDays = differenceInCalendarDays(range.to as Date, range.from) + 1;
  return {
    _start_date: dateKey(range.from),
    _end_date: dateKey(range.to as Date),
    _comparison_start: dateKey(subDays(range.from, periodDays)),
    _comparison_end: dateKey(subDays(range.from, 1)),
    _as_of_date: dateKey(range.to as Date),
  };
}

export function getFinancialControlDetailArguments(
  filters: FinancialControlDetailFilters,
): FinancialControlDetailArguments {
  if (!isValidFinancialControlDateRange(filters.startDate, filters.endDate)) {
    throw new Error('Invalid financial control date range');
  }
  if (!isMetric(filters.metric)) throw new Error('Invalid financial control metric');
  if (!isGroupBy(filters.groupBy)) throw new Error('Invalid financial control grouping');
  if (filters.alertKey !== null && !isAlertKey(filters.alertKey)) {
    throw new Error('Invalid financial control alert');
  }
  if (!isIntegerAtLeast(filters.page, 1)) throw new Error('Invalid financial control page');
  if (!isIntegerAtLeast(filters.pageSize, 1) || filters.pageSize > 100) {
    throw new Error('Invalid financial control page size');
  }

  const startKey = dateKey(filters.startDate);
  const endKey = dateKey(filters.endDate);
  return {
    _start_date: startKey,
    _end_date: endKey,
    _as_of_date: endKey,
    _metric: filters.metric,
    _group_by: filters.groupBy,
    _alert_key: filters.alertKey,
    _page: filters.page,
    _page_size: filters.pageSize,
  };
}

const CSV_HEADERS = [
  'Completed Date',
  'Queue Entry ID',
  'Consultation ID',
  'Patient',
  'Doctor',
  'Payment Type',
  'Payment Method',
  'Panel Provider',
  'Claim Status',
  'Claim Created Date',
  'Claim Due Date',
  'Group',
  'Billed',
  'Paid',
  'Paid In Period',
  'Outstanding',
  'COGS',
  'Gross Profit',
  'Margin %',
  'Discount',
  'Tax',
  'Refund',
  'Corrections',
  'Missing Cost Count',
  'Zero Price Count',
  'Amount',
  'Alerts',
  'Attribution Complete',
  'Cost Complete',
  'Visit Count',
] as const;

function csvEscape(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function csvValue(value: string | number | boolean | null): string {
  return value === null ? '' : csvEscape(String(value));
}

function csvMoney(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

export function financialControlRowsToCsv(rows: FinancialControlDetailRow[]): string {
  const body = rows.map((row) => [
    csvValue(row.completedDate),
    csvValue(row.queueEntryId),
    csvValue(row.consultationId),
    csvValue(row.patientName),
    csvValue(row.doctorName),
    csvValue(row.paymentType),
    csvValue(row.paymentMethod),
    csvValue(row.panelProviderName),
    csvValue(row.claimStatus),
    csvValue(row.claimCreatedDate),
    csvValue(row.claimDueDate),
    csvValue(row.groupLabel),
    csvMoney(row.billed),
    csvMoney(row.paid),
    csvMoney(row.paidInPeriod),
    csvMoney(row.outstanding),
    csvMoney(row.cogs),
    csvMoney(row.profit),
    csvValue(row.marginPct),
    csvMoney(row.discount),
    csvMoney(row.tax),
    csvMoney(row.refund),
    csvValue(row.corrections),
    csvValue(row.missingCostCount),
    csvValue(row.zeroPriceCount),
    csvMoney(row.amount),
    csvValue(row.alertKeys.join(', ')),
    csvValue(row.attributionComplete),
    csvValue(row.costComplete),
    csvValue(row.visitCount),
  ].join(','));

  return [CSV_HEADERS.join(','), ...body].join('\r\n');
}
