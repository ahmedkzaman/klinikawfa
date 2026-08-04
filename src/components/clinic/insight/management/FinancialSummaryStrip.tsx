import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  FinancialControlMetric,
  FinancialControlPeriodSummary,
} from '@/lib/clinic/financialControl';

interface FinancialSummaryStripProps {
  period: FinancialControlPeriodSummary;
  comparison: FinancialControlPeriodSummary;
  comparisonLabel: string;
  selectedMetric: FinancialControlMetric;
  onMetricSelect: (metric: FinancialControlMetric) => void;
}

interface MetricDefinition {
  label: string;
  description: string;
  metric: FinancialControlMetric | null;
  value: keyof FinancialControlPeriodSummary;
  kind: 'money' | 'percentage';
}

const METRICS: MetricDefinition[] = [
  {
    label: 'Billed Revenue',
    description: 'Bills completed in this period',
    metric: 'billed_revenue',
    value: 'billedRevenue',
    kind: 'money',
  },
  {
    label: 'Cash Collected',
    description: 'Payments received in this period',
    metric: 'cash_collected',
    value: 'cashCollected',
    kind: 'money',
  },
  {
    label: 'Cohort Outstanding',
    description: 'Still due from this period\'s bills',
    metric: 'cohort_outstanding',
    value: 'cohortOutstanding',
    kind: 'money',
  },
  {
    label: 'Total Outstanding',
    description: 'All active balances as of period end',
    metric: 'total_outstanding',
    value: 'totalOutstanding',
    kind: 'money',
  },
  {
    label: 'COGS',
    description: 'Attributed dispensing and service cost',
    metric: 'cogs',
    value: 'cogs',
    kind: 'money',
  },
  {
    label: 'Gross Profit',
    description: 'Billed revenue less attributed COGS',
    metric: 'gross_profit',
    value: 'grossProfit',
    kind: 'money',
  },
  {
    label: 'Gross Margin',
    description: 'Gross profit as a share of billed revenue',
    metric: 'margin',
    value: 'grossMarginPct',
    kind: 'percentage',
  },
  {
    label: 'Average Bill',
    description: 'Billed revenue per completed visit',
    metric: null,
    value: 'averageBill',
    kind: 'money',
  },
];

function formatMoney(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatValue(value: number | null, kind: MetricDefinition['kind']): string {
  if (value === null) return 'Unavailable';
  return kind === 'percentage' ? `${value.toFixed(1)}%` : formatMoney(value);
}

function comparisonText(
  current: number | null,
  previous: number | null,
  kind: MetricDefinition['kind'],
  label: string,
): { text: string; direction: 'up' | 'down' | 'same' | 'unavailable' } {
  if (current === null || previous === null) {
    return { text: 'Comparison unavailable', direction: 'unavailable' };
  }
  if (current === previous) {
    return { text: `no change vs ${label}`, direction: 'same' };
  }
  if (previous === 0) {
    const direction = current > 0 ? 'up' : 'down';
    const baseline = kind === 'percentage' ? '0.0%' : 'RM 0.00';
    return { text: `${direction} from ${baseline} vs ${label}`, direction };
  }

  const direction = current > previous ? 'up' : 'down';
  const change = Math.abs(((current - previous) / Math.abs(previous)) * 100);
  return { text: `${direction} ${change.toFixed(1)}% vs ${label}`, direction };
}

function Comparison({
  current,
  previous,
  kind,
  label,
}: {
  current: number | null;
  previous: number | null;
  kind: MetricDefinition['kind'];
  label: string;
}) {
  const comparison = comparisonText(current, previous, kind, label);
  const Icon = comparison.direction === 'up'
    ? TrendingUp
    : comparison.direction === 'down'
      ? TrendingDown
      : Minus;

  return (
    <span
      className={cn(
        'mt-2 flex min-h-4 items-center gap-1 text-[11px] leading-4',
        comparison.direction === 'up' && 'text-emerald-700',
        comparison.direction === 'down' && 'text-rose-700',
        (comparison.direction === 'same' || comparison.direction === 'unavailable') && 'text-slate-500',
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{comparison.text}</span>
    </span>
  );
}

export function FinancialSummaryStrip({
  period,
  comparison,
  comparisonLabel,
  selectedMetric,
  onMetricSelect,
}: FinancialSummaryStripProps) {
  return (
    <section
      aria-label="Financial control summary"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_3px_14px_rgb(15,23,42,0.035)]"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((definition) => {
          const current = period[definition.value] as number | null;
          const previous = comparison[definition.value] as number | null;
          const content = (
            <>
              <span className="block text-xs font-semibold text-slate-700">{definition.label}</span>
              <span className="mt-1 block break-words text-lg font-semibold leading-6 text-slate-950 tabular-nums">
                {formatValue(current, definition.kind)}
              </span>
              <span className="mt-1 block min-h-8 text-[11px] leading-4 text-slate-500">
                {definition.description}
              </span>
              <Comparison
                current={current}
                previous={previous}
                kind={definition.kind}
                label={comparisonLabel}
              />
            </>
          );

          if (definition.metric === null) {
            return (
              <div key={definition.label} className="min-w-0 border-b border-r border-slate-100 p-4">
                {content}
              </div>
            );
          }

          const isSelected = selectedMetric === definition.metric;
          return (
            <button
              key={definition.label}
              type="button"
              aria-label={`${definition.label} details`}
              aria-pressed={isSelected}
              onClick={() => onMetricSelect(definition.metric as FinancialControlMetric)}
              className={cn(
                'min-w-0 border-b border-r border-slate-100 p-4 text-left transition-colors',
                'hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600',
                isSelected && 'bg-blue-50/70',
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
