import { AlertCircle, AlertTriangle, CircleAlert, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type {
  FinancialControlAlert,
  FinancialControlAlertKey,
  FinancialControlAlertSeverity,
} from '@/lib/clinic/financialControl';

interface FinancialAlertsTableProps {
  alerts: FinancialControlAlert[];
  onView: (alertKey: FinancialControlAlertKey) => void;
}

const FINANCIAL_ALERT_LABELS: Record<FinancialControlAlertKey, string> = {
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

const SEVERITY_RANK: Record<FinancialControlAlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_STYLES: Record<FinancialControlAlertSeverity, string> = {
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-slate-200 bg-slate-50 text-slate-700',
};

const SEVERITY_ICONS = {
  critical: CircleAlert,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
} satisfies Record<FinancialControlAlertSeverity, typeof AlertCircle>;

function formatMoney(value: number): string {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sortedAlerts(alerts: FinancialControlAlert[]): FinancialControlAlert[] {
  return [...alerts].sort((left, right) => (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || right.amount - left.amount
    || right.oldestAgeDays - left.oldestAgeDays
    || left.key.localeCompare(right.key)
  ));
}

export function FinancialAlertsTable({ alerts, onView }: FinancialAlertsTableProps) {
  const orderedAlerts = sortedAlerts(alerts);

  return (
    <section
      aria-labelledby="financial-alerts-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_3px_14px_rgb(15,23,42,0.035)]"
    >
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <h2 id="financial-alerts-heading" className="text-sm font-semibold text-slate-900">
          Financial alerts
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Exceptions ordered by severity, amount at risk, and age.
        </p>
      </div>

      {orderedAlerts.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-500">
          No financial alerts in this period
        </div>
      ) : (
        <Table aria-label="Financial alerts" className="min-w-[720px] table-fixed">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="h-9 w-[31%] px-4 text-[11px] font-semibold text-slate-600">Alert</TableHead>
              <TableHead className="h-9 w-[16%] px-3 text-[11px] font-semibold text-slate-600">Severity</TableHead>
              <TableHead className="h-9 w-[11%] px-3 text-right text-[11px] font-semibold text-slate-600">Count</TableHead>
              <TableHead className="h-9 w-[20%] px-3 text-right text-[11px] font-semibold text-slate-600">Amount at risk</TableHead>
              <TableHead className="h-9 w-[12%] px-3 text-right text-[11px] font-semibold text-slate-600">Oldest</TableHead>
              <TableHead className="h-9 w-[10%] px-4 text-right text-[11px] font-semibold text-slate-600">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderedAlerts.map((alert) => {
              const Icon = SEVERITY_ICONS[alert.severity];
              const label = FINANCIAL_ALERT_LABELS[alert.key];
              return (
                <TableRow key={alert.key} className="hover:bg-slate-50/80">
                  <TableCell className="px-4 py-3 text-xs font-medium text-slate-900">
                    <span className="block truncate" title={label}>{label}</span>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold capitalize',
                      SEVERITY_STYLES[alert.severity],
                    )}>
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {alert.severity}
                    </span>
                    {!alert.attributionComplete && (
                      <span className="mt-1 block text-[10px] leading-4 text-amber-800">
                        {alert.incompleteRows} incomplete
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right text-xs tabular-nums text-slate-700">
                    {alert.count}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right text-xs font-medium tabular-nums text-slate-900">
                    {formatMoney(alert.amount)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right text-xs tabular-nums text-slate-700">
                    {alert.oldestAgeDays} {alert.oldestAgeDays === 1 ? 'day' : 'days'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`View ${label}`}
                      onClick={() => onView(alert.key)}
                      className="h-8 rounded-md px-3 text-xs focus-visible:ring-blue-600"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
