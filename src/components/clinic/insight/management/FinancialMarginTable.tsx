import { ExternalLink } from 'lucide-react';

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
  FinancialControlDetailRow,
  FinancialControlGroupBy,
} from '@/lib/clinic/financialControl';
import { getFinancialAttributionIssues } from '@/lib/clinic/financialControl';

interface FinancialMarginTableProps {
  rows: FinancialControlDetailRow[];
  groupBy: FinancialControlGroupBy;
  showGrouping: boolean;
  onGroupByChange: (groupBy: FinancialControlGroupBy) => void;
}

const GROUPINGS: Array<{ value: Exclude<FinancialControlGroupBy, 'visit'>; label: string }> = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'procedure', label: 'Procedure / service' },
  { value: 'package', label: 'Package' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'payment_type', label: 'Payment type' },
  { value: 'panel_provider', label: 'Panel provider' },
];

function formatMoney(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMargin(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function textOrUnavailable(value: string | null): string {
  return value?.trim() || 'Unavailable';
}

function EntityCell({ row, isVisit }: { row: FinancialControlDetailRow; isVisit: boolean }) {
  const attributionIssues = getFinancialAttributionIssues(row);
  return (
    <div className="min-w-0 max-w-[17rem]">
      <span className="block break-words text-xs font-semibold leading-5 text-slate-900">
        {isVisit ? textOrUnavailable(row.patientName) : row.groupLabel}
      </span>
      <span className="block truncate text-[10px] leading-4 text-slate-500" title={isVisit ? row.groupLabel : row.groupKey}>
        {isVisit ? row.queueEntryId ?? 'No queue reference' : `${row.visitCount} ${row.visitCount === 1 ? 'visit' : 'visits'}`}
      </span>
      {attributionIssues.length > 0 && (
        <span
          className="mt-1 block text-[10px] leading-4 text-amber-800"
          title={`Incomplete: ${attributionIssues.join(', ')}`}
        >
          Incomplete: {attributionIssues.join(', ')}
        </span>
      )}
    </div>
  );
}

function DetailLinks({ queueEntryId }: { queueEntryId: string | null }) {
  if (!queueEntryId) return <span className="text-[10px] text-slate-400">Unavailable</span>;

  return (
    <div className="flex min-w-[7rem] flex-col items-start gap-1">
      <a
        href={`/clinic/visits/${queueEntryId}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Open visit <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
      <a
        href={`/clinic/billings?queue=${encodeURIComponent(queueEntryId)}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Open bill <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

export function FinancialMarginTable({
  rows,
  groupBy,
  showGrouping,
  onGroupByChange,
}: FinancialMarginTableProps) {
  const isVisit = groupBy === 'visit';

  return (
    <div className="min-w-0 space-y-3">
      {showGrouping && (
        <div
          role="group"
          aria-label="Group margin analysis by"
          className="flex max-w-full gap-1 overflow-x-auto border-b border-slate-200 pb-2"
        >
          {GROUPINGS.map((grouping) => (
            <Button
              key={grouping.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={groupBy === grouping.value}
              onClick={() => onGroupByChange(grouping.value)}
              className={cn(
                'h-8 shrink-0 rounded-md px-3 text-xs text-slate-600 focus-visible:ring-blue-600',
                groupBy === grouping.value && 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white',
              )}
            >
              {grouping.label}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <Table aria-label="Financial details" className="min-w-[1180px] table-fixed">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="h-9 w-56 px-3 text-[11px] font-semibold text-slate-600">
                {isVisit ? 'Patient / visit' : 'Group'}
              </TableHead>
              <TableHead className="h-9 w-28 px-3 text-[11px] font-semibold text-slate-600">Completed</TableHead>
              <TableHead className="h-9 w-36 px-3 text-[11px] font-semibold text-slate-600">Doctor</TableHead>
              <TableHead className="h-9 w-40 px-3 text-[11px] font-semibold text-slate-600">Payment</TableHead>
              <TableHead className="h-9 w-28 px-3 text-right text-[11px] font-semibold text-slate-600">Billed</TableHead>
              <TableHead className="h-9 w-28 px-3 text-right text-[11px] font-semibold text-slate-600">Paid</TableHead>
              <TableHead className="h-9 w-28 px-3 text-right text-[11px] font-semibold text-slate-600">Outstanding</TableHead>
              <TableHead className="h-9 w-28 px-3 text-right text-[11px] font-semibold text-slate-600">COGS</TableHead>
              <TableHead className="h-9 w-28 px-3 text-right text-[11px] font-semibold text-slate-600">Profit</TableHead>
              <TableHead className="h-9 w-24 px-3 text-right text-[11px] font-semibold text-slate-600">Margin</TableHead>
              <TableHead className="h-9 w-32 px-3 text-[11px] font-semibold text-slate-600">Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.groupKey}-${row.queueEntryId ?? 'group'}`} className="hover:bg-slate-50/80">
                <TableCell className="px-3 py-3 align-top"><EntityCell row={row} isVisit={isVisit} /></TableCell>
                <TableCell className="px-3 py-3 align-top text-xs text-slate-600">{formatDate(row.completedDate)}</TableCell>
                <TableCell className="px-3 py-3 align-top text-xs text-slate-700">
                  <span className="block max-w-32 truncate" title={row.doctorName ?? undefined}>{textOrUnavailable(row.doctorName)}</span>
                </TableCell>
                <TableCell className="px-3 py-3 align-top text-xs text-slate-700">
                  <span className="block truncate capitalize" title={row.paymentType ?? undefined}>{textOrUnavailable(row.paymentType)?.replaceAll('_', ' ')}</span>
                  <span className="block truncate text-[10px] text-slate-500" title={row.paymentMethod ?? row.panelProviderName ?? undefined}>
                    {row.paymentMethod?.replaceAll('_', ' ') ?? row.panelProviderName ?? 'No method'}
                  </span>
                </TableCell>
                {[row.billed, row.paid, row.outstanding, row.cogs, row.profit].map((value, index) => (
                  <TableCell key={index} className="px-3 py-3 align-top text-right text-xs font-medium tabular-nums text-slate-800">
                    <span className="block break-words">{formatMoney(value)}</span>
                  </TableCell>
                ))}
                <TableCell className={cn(
                  'px-3 py-3 align-top text-right text-xs font-semibold tabular-nums',
                  row.marginPct !== null && row.marginPct < 0 ? 'text-rose-700' : 'text-slate-800',
                )}>
                  {formatMargin(row.marginPct)}
                </TableCell>
                <TableCell className="px-3 py-3 align-top">
                  {isVisit ? <DetailLinks queueEntryId={row.queueEntryId} /> : <span className="text-[10px] text-slate-400">Group total</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
