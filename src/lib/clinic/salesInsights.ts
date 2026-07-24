import { addDays, format } from 'date-fns';

export const SALES_PAGE_SIZE = 1000;
const CLINIC_UTC_OFFSET = '+08:00';
const CLINIC_TIME_ZONE = 'Asia/Kuala_Lumpur';

export interface SalesPaymentRow {
  id: string;
  created_at: string;
  queue_entry_id: string | null;
  consultation_id: string | null;
  payment_type: string;
  payment_method: string | null;
  amount: number | string | null;
}

export interface SalesSummary {
  totalCollected: number;
  paymentCount: number;
  visitCount: number;
}

export interface SalesDailyTrendPoint {
  date: string;
  collected: number;
}

export interface SalesMethodRow {
  method: string;
  collected: number;
  paymentCount: number;
}

export interface SalesInsightRow {
  paymentId: string;
  createdAt: string;
  queueEntryId: string | null;
  consultationId: string | null;
  paymentType: string;
  paymentMethod: string | null;
  amount: number;
}

export interface SalesInsights {
  summary: SalesSummary;
  dailyTrends: SalesDailyTrendPoint[];
  byMethod: SalesMethodRow[];
  rows: SalesInsightRow[];
}

function finiteAmount(value: number | string | null): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function clinicDateKey(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getLocalDateRangeBounds(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endExclusiveKey = format(addDays(endDate, 1), 'yyyy-MM-dd');
  return {
    startIso: new Date(`${startKey}T00:00:00${CLINIC_UTC_OFFSET}`).toISOString(),
    endExclusiveIso: new Date(`${endExclusiveKey}T00:00:00${CLINIC_UTC_OFFSET}`).toISOString(),
  };
}

export function shouldFetchNextSalesPage(rowCount: number): boolean {
  return rowCount === SALES_PAGE_SIZE;
}

export function aggregateSalesInsights(rows: SalesPaymentRow[]): SalesInsights {
  let totalCollected = 0;
  const paymentIds = new Set<string>();
  const visitIds = new Set<string>();
  const dailyMap = new Map<string, number>();
  const methodMap = new Map<string, { collected: number; paymentCount: number }>();

  const rawRows = rows.map((row) => {
    const amount = finiteAmount(row.amount);
    const day = clinicDateKey(row.created_at);
    const method = row.payment_method?.trim() || 'unknown';

    totalCollected += amount;
    paymentIds.add(row.id);
    if (row.queue_entry_id) visitIds.add(row.queue_entry_id);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + amount);

    const methodTotal = methodMap.get(method) ?? { collected: 0, paymentCount: 0 };
    methodTotal.collected += amount;
    methodTotal.paymentCount += 1;
    methodMap.set(method, methodTotal);

    return {
      paymentId: row.id,
      createdAt: row.created_at,
      queueEntryId: row.queue_entry_id,
      consultationId: row.consultation_id,
      paymentType: row.payment_type,
      paymentMethod: row.payment_method,
      amount,
    };
  });

  return {
    summary: {
      totalCollected,
      paymentCount: paymentIds.size,
      visitCount: visitIds.size,
    },
    dailyTrends: Array.from(dailyMap, ([date, collected]) => ({ date, collected }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byMethod: Array.from(methodMap, ([method, value]) => ({
      method,
      collected: value.collected,
      paymentCount: value.paymentCount,
    })).sort((a, b) => b.collected - a.collected),
    rows: rawRows,
  };
}
