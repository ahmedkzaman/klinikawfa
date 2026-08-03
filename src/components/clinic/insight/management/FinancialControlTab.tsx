import { useMemo, useState } from 'react';
import { AlertTriangle, ReceiptText } from 'lucide-react';
import { differenceInCalendarDays, format, subDays } from 'date-fns';

import { Skeleton } from '@/components/ui/skeleton';
import { useFinancialControlSummary } from '@/hooks/clinic/useFinancialControl';
import type {
  FinancialControlAlertKey,
  FinancialControlGroupBy,
  FinancialControlMetric,
  FinancialControlPeriodSummary,
} from '@/lib/clinic/financialControl';
import { FinancialAlertsTable } from './FinancialAlertsTable';
import { FinancialDetailSheet } from './FinancialDetailSheet';
import { FinancialReconciliation } from './FinancialReconciliation';
import { FinancialSummaryStrip } from './FinancialSummaryStrip';

interface FinancialControlTabProps {
  startDate: Date;
  endDate: Date;
}

const METRIC_LABELS: Record<FinancialControlMetric, string> = {
  billed_revenue: 'Billed Revenue',
  cash_collected: 'Cash Collected',
  cohort_outstanding: 'Cohort Outstanding',
  total_outstanding: 'Total Outstanding',
  cogs: 'COGS',
  gross_profit: 'Gross Profit',
  adjustments: 'Adjustments',
  alerts: 'Financial alerts',
  margin: 'Gross Margin',
};

const ALERT_LABELS: Record<FinancialControlAlertKey, string> = {
  unpaid_self_pay: 'Unpaid self-pay bill',
  unsubmitted_panel: 'Unsubmitted panel claim',
  overdue_panel: 'Overdue panel claim',
  missing_cost: 'Missing cost',
  zero_price: 'Zero price',
  negative_margin: 'Negative margin',
  large_discount: 'Large discount',
  refund_void_correction: 'Refund, void, or correction',
  payment_mismatch: 'Payment mismatch',
  duplicate_or_excess_payment: 'Duplicate or excess payment',
};

function comparisonPeriodLabel(startDate: Date, endDate: Date): string {
  const periodDays = differenceInCalendarDays(endDate, startDate) + 1;
  const comparisonStart = subDays(startDate, periodDays);
  const comparisonEnd = subDays(startDate, 1);
  const includeYear = comparisonEnd.getFullYear() !== endDate.getFullYear();
  const endFormat = includeYear ? 'd MMM yyyy' : 'd MMM';
  if (format(comparisonStart, 'MMM yyyy') === format(comparisonEnd, 'MMM yyyy')) {
    return `${format(comparisonStart, 'd')}-${format(comparisonEnd, endFormat)}`;
  }
  return `${format(comparisonStart, 'd MMM')}-${format(comparisonEnd, endFormat)}`;
}

function lastUpdatedLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

function hasFinancialActivity(period: FinancialControlPeriodSummary): boolean {
  if (period.completedVisits > 0) return true;
  return [
    period.billedRevenue,
    period.cashCollected,
    period.cohortOutstanding,
    period.totalOutstanding,
    period.cogs,
    period.grossProfit,
  ].some((value) => value === null || value !== 0);
}

function costStatusLabel(period: FinancialControlPeriodSummary): string | null {
  if (period.costComplete) return null;
  if (!period.attributionComplete && period.missingCostItems === 0) {
    return 'Cost completeness unknown because attribution is incomplete';
  }
  return `Cost data incomplete for ${period.missingCostItems} items`;
}

function LoadingState() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading financial control summary"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <span className="sr-only">Loading financial control summary</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-[132px] border-b border-r border-slate-100 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinancialControlTab({ startDate, endDate }: FinancialControlTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<FinancialControlMetric>('billed_revenue');
  const [selectedAlert, setSelectedAlert] = useState<FinancialControlAlertKey | null>(null);
  const [groupBy, setGroupBy] = useState<FinancialControlGroupBy>('visit');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [detailOpen, setDetailOpen] = useState(false);
  const range = useMemo(() => ({ from: startDate, to: endDate }), [endDate, startDate]);
  const { data, isLoading, isError, error } = useFinancialControlSummary(range);
  const comparisonLabel = comparisonPeriodLabel(startDate, endDate);

  const openMetricDetails = (metric: FinancialControlMetric) => {
    setSelectedMetric(metric);
    setSelectedAlert(null);
    setGroupBy(metric === 'margin' ? 'medicine' : 'visit');
    setPage(1);
    setDetailOpen(true);
  };

  const openAlertDetails = (alertKey: FinancialControlAlertKey) => {
    setSelectedMetric('alerts');
    setSelectedAlert(alertKey);
    setGroupBy('visit');
    setPage(1);
    setDetailOpen(true);
  };

  const changeGroup = (nextGroup: FinancialControlGroupBy) => {
    setGroupBy(nextGroup);
    setPage(1);
  };

  const changePageSize = (nextPageSize: number) => {
    if (![25, 50, 100].includes(nextPageSize)) return;
    setPageSize(nextPageSize);
    setPage(1);
  };

  const detailTitle = selectedAlert
    ? `${ALERT_LABELS[selectedAlert]} details`
    : `${METRIC_LABELS[selectedMetric]} details`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Financial Control</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">
            Separate billed work, collected cash, cost, and outstanding balances for the selected period.
          </p>
        </div>
        {data && (
          <p className="shrink-0 text-[11px] text-slate-500">
            Last updated {lastUpdatedLabel(data.generated_at)}
          </p>
        )}
      </div>

      {isError ? (
        <section role="alert" className="rounded-lg border border-rose-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-rose-800">Financial control summary unavailable</h3>
          <p className="mt-1 text-xs text-rose-700">
            {(error as Error)?.message ?? 'Unknown error'}
          </p>
        </section>
      ) : isLoading || !data ? (
        <LoadingState />
      ) : !hasFinancialActivity(data.period) ? (
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center">
          <ReceiptText className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No financial activity in this period</h3>
          <p className="mt-1 text-xs text-slate-500">Choose a wider date range to review completed bills or collections.</p>
        </section>
      ) : (
        <>
          {(!data.period.attributionComplete || !data.period.costComplete) && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:gap-5">
              <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              {!data.period.attributionComplete && (
                <span>Attribution incomplete for {data.period.incompleteVisits} visits</span>
              )}
              {costStatusLabel(data.period) && <span>{costStatusLabel(data.period)}</span>}
            </div>
          )}

          <FinancialSummaryStrip
            period={data.period}
            comparison={data.comparison}
            comparisonLabel={comparisonLabel}
            comparisonAttributionComplete={data.comparison.attributionComplete}
            comparisonCostComplete={data.comparison.costComplete}
            comparisonIncompleteVisits={data.comparison.incompleteVisits}
            comparisonMissingCostItems={data.comparison.missingCostItems}
            selectedMetric={selectedMetric}
            onMetricSelect={openMetricDetails}
          />

          <FinancialReconciliation reconciliation={data.reconciliation} />

          <FinancialAlertsTable alerts={data.alerts} onView={openAlertDetails} />

          {detailOpen && (
            <FinancialDetailSheet
              open={detailOpen}
              onOpenChange={setDetailOpen}
              title={detailTitle}
              startDate={startDate}
              endDate={endDate}
              metric={selectedMetric}
              groupBy={groupBy}
              alertKey={selectedAlert}
              page={page}
              pageSize={pageSize}
              onGroupByChange={changeGroup}
              onPageChange={setPage}
              onPageSizeChange={changePageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
