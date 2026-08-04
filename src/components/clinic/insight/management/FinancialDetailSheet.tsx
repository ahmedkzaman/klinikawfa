import { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFinancialControlDetails } from '@/hooks/clinic/useFinancialControl';
import { supabase } from '@/integrations/supabase/client';
import {
  collectFinancialControlExportRows,
  financialControlExportFilename,
  financialControlRowsToCsv,
  getFinancialControlDetailArguments,
  parseFinancialControlDetails,
  type FinancialControlAlertKey,
  type FinancialControlGroupBy,
  type FinancialControlMetric,
} from '@/lib/clinic/financialControl';
import { FinancialMarginTable } from './FinancialMarginTable';

const DETAIL_ERROR_MESSAGE = 'Financial details are temporarily unavailable. Please retry.';
const EXPORT_ERROR_MESSAGE = 'The CSV export could not be prepared. Please retry.';

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
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
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
  const filters = {
    startDate,
    endDate,
    metric,
    groupBy,
    alertKey,
    page,
    pageSize,
  };

  useEffect(() => {
    setExportNotice(null);
    setExportError(null);
  }, [alertKey, endDate, groupBy, metric, pageSize, startDate]);

  const retryDetails = () => {
    void detail.refetch();
  };

  const exportCsv = async () => {
    if (!detail.data || detail.data.total === 0 || isExporting) return;

    setIsExporting(true);
    setExportNotice(null);
    setExportError(null);
    try {
      const fetchPage = async (pageFilters: typeof filters) => {
        const args = getFinancialControlDetailArguments(pageFilters);
        const { data, error } = await supabase.rpc('get_financial_control_details', args);
        if (error) throw error;
        return parseFinancialControlDetails(data);
      };
      const result = detail.data.page === 1 && detail.data.rows.length >= detail.data.total
        ? { rows: detail.data.rows.slice(0, detail.data.total), truncated: false }
        : await collectFinancialControlExportRows(filters, detail.data.total, fetchPage);
      const csv = financialControlRowsToCsv(result.rows, groupBy);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = financialControlExportFilename(filters);
      anchor.click();
      URL.revokeObjectURL(url);

      if (result.truncated) {
        setExportNotice(
          `Export limited to the first 10,000 of ${detail.data.total.toLocaleString('en-MY')} rows.`,
        );
      }
    } catch (error) {
      setExportError(EXPORT_ERROR_MESSAGE);
    } finally {
      setIsExporting(false);
    }
  };

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

        {detail.isError && !detail.data ? (
          <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-white px-4 py-5">
            <h3 className="text-sm font-semibold text-rose-800">Financial details unavailable</h3>
            <p className="mt-1 text-xs text-rose-700">{DETAIL_ERROR_MESSAGE}</p>
            <Button
              type="button"
              variant="outline"
              onClick={retryDetails}
              className="mt-3 h-9 rounded-md px-3 text-xs focus-visible:ring-blue-600"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry financial details
            </Button>
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
            {detail.isError && (
              <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-amber-900">
                  Detail data is stale. Please retry to refresh it.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={retryDetails}
                  className="h-9 shrink-0 rounded-md bg-white px-3 text-xs focus-visible:ring-blue-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry financial details
                </Button>
              </div>
            )}

            <div className="flex min-h-9 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-500">
                {detail.data.total.toLocaleString('en-MY')} matching rows
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={isExporting || detail.data.rows.length === 0}
                aria-label="Export financial details as CSV"
                aria-busy={isExporting}
                onClick={() => void exportCsv()}
                className="h-9 w-36 shrink-0 rounded-md px-3 text-xs focus-visible:ring-blue-600"
              >
                {isExporting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isExporting ? 'Exporting' : 'Export CSV'}
              </Button>
            </div>

            {exportNotice && (
              <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {exportNotice}
              </p>
            )}
            {exportError && (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {exportError}
              </p>
            )}

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
