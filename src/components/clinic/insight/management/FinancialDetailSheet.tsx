import { LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFinancialControlDetails } from '@/hooks/clinic/useFinancialControl';
import type {
  FinancialControlAlertKey,
  FinancialControlGroupBy,
  FinancialControlMetric,
} from '@/lib/clinic/financialControl';
import { FinancialMarginTable } from './FinancialMarginTable';

interface FinancialDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  startDate: Date;
  endDate: Date;
  metric: FinancialControlMetric;
  groupBy: FinancialControlGroupBy;
  alertKey: FinancialControlAlertKey | null;
  page: number;
  pageSize: number;
  onGroupByChange: (groupBy: FinancialControlGroupBy) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function formatMoney(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function FinancialDetailSheet({
  open,
  onOpenChange,
  title,
  startDate,
  endDate,
  metric,
  groupBy,
  alertKey,
  page,
  pageSize,
  onGroupByChange,
  onPageChange,
  onPageSizeChange,
}: FinancialDetailSheetProps) {
  const detail = useFinancialControlDetails({
    startDate,
    endDate,
    metric,
    groupBy,
    alertKey,
    page,
    pageSize,
  });
  const pageCount = detail.data ? Math.max(1, Math.ceil(detail.data.total / pageSize)) : 1;
  const canGoPrevious = page > 1;
  const canGoNext = Boolean(detail.data && page < pageCount);

  return (
    <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-slate-50 p-4 sm:max-w-[calc(100vw-3rem)] sm:p-5 xl:max-w-7xl"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="text-base font-semibold text-slate-950">{title}</SheetTitle>
          <SheetDescription className="text-xs leading-5 text-slate-500">
            Financial rows for the selected period and filters.
          </SheetDescription>
        </SheetHeader>

        {detail.isError ? (
          <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-white px-4 py-5">
            <h3 className="text-sm font-semibold text-rose-800">Financial details unavailable</h3>
            <p className="mt-1 text-xs text-rose-700">
              {(detail.error as Error)?.message ?? 'Unknown error'}
            </p>
          </div>
        ) : detail.isLoading || !detail.data ? (
          <div
            aria-busy="true"
            aria-label="Loading financial details"
            className="mt-5 flex min-h-40 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-500"
          >
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Loading financial details
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Rows', String(detail.data.total)],
                ['Billed', formatMoney(detail.data.totals.billed)],
                ['Paid', formatMoney(detail.data.totals.paid)],
                ['Outstanding', formatMoney(detail.data.totals.outstanding)],
                ['COGS', formatMoney(detail.data.totals.cogs)],
                ['Profit', formatMoney(detail.data.totals.profit)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 border-b border-r border-slate-100 px-3 py-3">
                  <span className="block text-[10px] font-medium text-slate-500">{label}</span>
                  <span className="mt-0.5 block break-words text-xs font-semibold tabular-nums text-slate-900">{value}</span>
                </div>
              ))}
            </div>

            {!detail.data.totals.attributionComplete && (
              <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Attribution is incomplete for {detail.data.totals.incompleteRows} rows.
              </p>
            )}

            {detail.data.rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center">
                <h3 className="text-sm font-semibold text-slate-900">No financial rows match these filters</h3>
                <p className="mt-1 text-xs text-slate-500">Choose another metric or grouping.</p>
              </div>
            ) : (
              <FinancialMarginTable
                rows={detail.data.rows}
                groupBy={groupBy}
                showGrouping={metric === 'margin' && alertKey === null}
                onGroupByChange={onGroupByChange}
              />
            )}

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Rows per page
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoPrevious}
                  onClick={() => onPageChange(page - 1)}
                  className="h-9 w-24 rounded-md text-xs focus-visible:ring-blue-600"
                >
                  Previous
                </Button>
                <span className="w-24 text-center text-xs tabular-nums text-slate-600">
                  Page {page} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoNext}
                  onClick={() => onPageChange(page + 1)}
                  className="h-9 w-24 rounded-md text-xs focus-visible:ring-blue-600"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
