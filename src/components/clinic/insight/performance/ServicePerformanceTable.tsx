import { useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InsightPerformanceService } from '@/lib/clinic/insight/performance';
import type { InsightPerformanceFilters, InsightPerformanceViewerScope } from '@/hooks/clinic/useInsightPerformance';
import { useInsightPerformanceDetail } from '@/hooks/clinic/useInsightPerformanceDetail';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';

type ServiceSortKey = 'volume' | 'uniquePatients' | 'revenue' | 'cogs' | 'profit' | 'marginPct' | 'averagePrice' | 'trendPct' | 'doctorCount';

const formatRM = (value: number | null) => value == null
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPaymentType = (value: 'self_pay' | 'panel') => {
  if (value === 'self_pay') return 'Self-pay';
  if (value === 'panel') return 'Panel';
  return 'Unavailable';
};

function serviceTrendLabel(trendPct: number | null): string {
  if (trendPct == null) return 'Comparison unavailable';
  if (trendPct === 0) return 'No change';
  return `${Math.abs(trendPct).toFixed(1)}% ${trendPct > 0 ? 'increase' : 'decrease'}`;
}

function ServiceDetail({ service, open, onOpenChange, startDate, endDate, viewerScope, filters, canSeeNamedDoctors, returnFocusRef }: { service: InsightPerformanceService | null; open: boolean; onOpenChange: (open: boolean) => void; startDate: Date; endDate: Date; viewerScope: InsightPerformanceViewerScope; filters: InsightPerformanceFilters; canSeeNamedDoctors: boolean; returnFocusRef: MutableRefObject<HTMLElement | null> }) {
  useLayoutEffect(() => {
    if (open) return;
    const target = returnFocusRef.current;
    const timeout = window.setTimeout(() => {
      target?.focus();
      if (returnFocusRef.current === target) returnFocusRef.current = null;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open, returnFocusRef]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {service ? (
          <>
            <SheetHeader>
              <SheetTitle>{service.serviceName} service details</SheetTitle>
              <SheetDescription>Demand, pricing, cost, and doctor coverage for the selected period.</SheetDescription>
            </SheetHeader>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <Detail label="Volume" value={String(service.volume)} />
              <Detail label="Unique patients" value={String(service.uniquePatients)} />
              <Detail label="Revenue" value={formatRM(service.revenue)} />
              <Detail label="Average charged price" value={formatRM(service.averagePrice)} />
              <Detail label="COGS" value={service.cogs == null ? 'COGS unavailable' : formatRM(service.cogs)} />
              <Detail label="Gross profit" value={formatRM(service.profit)} />
              <Detail label="Margin" value={service.marginPct == null ? 'Unavailable' : `${service.marginPct.toFixed(1)}%`} />
              <Detail label="Demand trend" value={serviceTrendLabel(service.trendPct)} />
              <Detail label="Doctor contribution" value={`${service.doctorCount} doctor${service.doctorCount === 1 ? '' : 's'}`} />
              <Detail label="Cost quality" value={service.missingCostCount > 0 ? `${service.missingCostCount} missing-cost item${service.missingCostCount === 1 ? '' : 's'}` : 'Complete'} />
            </dl>
            <ServiceDetailData service={service} startDate={startDate} endDate={endDate} viewerScope={viewerScope} filters={filters} canSeeNamedDoctors={canSeeNamedDoctors} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ServiceDetailData({ service, startDate, endDate, viewerScope, filters, canSeeNamedDoctors }: { service: InsightPerformanceService; startDate: Date; endDate: Date; viewerScope: InsightPerformanceViewerScope; filters: InsightPerformanceFilters; canSeeNamedDoctors: boolean }) {
  const query = useInsightPerformanceDetail(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), 'service', service.serviceId, viewerScope, filters);
  const detail = query.data?.kind === 'service' ? query.data : null;
  if (query.isLoading) return <p role="status" className="mt-4 text-sm text-slate-600">Loading service visit details…</p>;
  if (query.isError) return <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Service details could not be loaded. <button type="button" className="underline" onClick={() => { void query.refetch(); }}>Retry</button></div>;
  if (!detail) return <p className="mt-4 text-sm text-slate-500">No service drill-down is available for this period.</p>;
  return (
    <div className="mt-6 space-y-5">
      <section><h3 className="text-sm font-semibold text-slate-900">Current catalog economics</h3>{detail.currentCatalog ? <p className="mt-1 text-sm text-slate-600">Price {formatRM(detail.currentCatalog.price)} · COGS {formatRM(detail.currentCatalog.cogs)} · profit {formatRM(detail.currentCatalog.grossProfit)} · margin {detail.currentCatalog.marginPct == null ? 'Unavailable' : `${detail.currentCatalog.marginPct.toFixed(1)}%`}</p> : <p className="mt-1 text-sm text-slate-500">No current catalog row is linked.</p>}</section>
      <section><h3 className="text-sm font-semibold text-slate-900">Daily trend</h3><ul className="mt-1 text-sm text-slate-600">{detail.trend.map((row) => <li key={row.date}>{row.date}: {row.volume} performed · {formatRM(row.revenue)}</li>)}</ul></section>
      <section><h3 className="text-sm font-semibold text-slate-900">Payer mix</h3><ul className="mt-1 text-sm text-slate-600">{detail.paymentMix.map((row) => <li key={row.paymentType}>{formatPaymentType(row.paymentType)}: {row.visits} visits</li>)}</ul></section>
      {canSeeNamedDoctors ? <section><h3 className="text-sm font-semibold text-slate-900">Doctor contribution</h3><ul className="mt-1 text-sm text-slate-600">{detail.doctorContribution.map((row) => <li key={row.doctorId}>{row.doctorName}: {row.volume}</li>)}</ul></section> : null}
      <section><h3 className="text-sm font-semibold text-slate-900">Visit details</h3><div className="mt-2 space-y-2">{detail.visits.map((visit) => <article key={`${visit.queueEntryId}-${visit.visitDate}`} className="rounded-lg border p-3 text-sm"><p className="font-medium">Queue #{visit.queueSequence ?? '—'} · {visit.visitDate}</p><p className="text-slate-600">{formatPaymentType(visit.paymentType)} · {visit.quantity} × {formatRM(visit.unitPrice)} = {formatRM(visit.totalPrice)} · profit {formatRM(visit.grossProfit)}</p></article>)}</div></section>
      <section><h3 className="text-sm font-semibold text-slate-900">Price and margin history</h3><ul className="mt-1 text-sm text-slate-600">{detail.marginHistory.map((row) => <li key={row.date}>{row.date}: price {formatRM(row.averagePrice)}, COGS {formatRM(row.averageCogs)}, margin {row.marginPct == null ? 'Unavailable' : `${row.marginPct.toFixed(1)}%`}</li>)}</ul></section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div>;
}

export function ServicePerformanceTable({ services, startDate, endDate, viewerScope, filters, canSeeNamedDoctors }: { services: InsightPerformanceService[]; startDate: Date; endDate: Date; viewerScope: InsightPerformanceViewerScope; filters: InsightPerformanceFilters; canSeeNamedDoctors: boolean }) {
  const [sortKey, setSortKey] = useState<ServiceSortKey>('revenue');
  const [descending, setDescending] = useState(true);
  const [selectedService, setSelectedService] = useState<InsightPerformanceService | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const sortedServices = useMemo(() => [...services].sort((left, right) => {
    const leftValue = left[sortKey] ?? Number.NEGATIVE_INFINITY;
    const rightValue = right[sortKey] ?? Number.NEGATIVE_INFINITY;
    const difference = Number(leftValue) - Number(rightValue);
    if (difference !== 0) return descending ? -difference : difference;
    return left.serviceName.localeCompare(right.serviceName);
  }), [descending, services, sortKey]);
  const changeSort = (key: ServiceSortKey) => {
    if (sortKey === key) setDescending((current) => !current);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };
  const sortButton = (label: string, key: ServiceSortKey) => (
    <Button variant="ghost" size="sm" className="h-9 px-1.5 text-[11px] font-semibold uppercase tracking-wider" onClick={() => changeSort(key)} aria-label={`Sort services by ${label}`}>
      {label}{sortKey !== key ? <ChevronsUpDown className="h-3.5 w-3.5" /> : descending ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
    </Button>
  );
  const ariaSort = (key: ServiceSortKey) => sortKey !== key ? 'none' as const : descending ? 'descending' as const : 'ascending' as const;

  return (
    <>
      <Card className={bento}>
        <CardContent className="min-w-0 p-4 sm:p-6">
          <div className="mb-3">
            <h2 className={bentoHeader}>Service performance</h2>
            <p className="text-xs text-slate-500">Clinical service demand and margin using saved charged prices.</p>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Service</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('volume')}>{sortButton('Volume', 'volume')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('uniquePatients')}>{sortButton('Patients', 'uniquePatients')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('revenue')}>{sortButton('Revenue', 'revenue')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('cogs')}>{sortButton('COGS', 'cogs')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('profit')}>{sortButton('Profit', 'profit')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('marginPct')}>{sortButton('Margin', 'marginPct')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('averagePrice')}>{sortButton('Average price', 'averagePrice')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('trendPct')}>{sortButton('Trend', 'trendPct')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('doctorCount')}>{sortButton('Doctors', 'doctorCount')}</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedServices.map((service) => (
                  <TableRow key={service.serviceId} data-testid="service-performance-row">
                    <TableCell className="font-medium text-slate-900">
                      <span>{service.serviceName}</span>
                      {service.missingCostCount > 0 ? <Badge variant="outline" className="ml-2 border-amber-300 text-amber-800"><AlertTriangle className="mr-1 h-3 w-3" />Missing cost</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{service.volume}</TableCell>
                    <TableCell className="text-right tabular-nums">{service.uniquePatients}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRM(service.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRM(service.cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRM(service.profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{service.marginPct == null ? 'Unavailable' : `${service.marginPct.toFixed(1)}%`}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRM(service.averagePrice)}</TableCell>
                    <TableCell className="text-right">{serviceTrendLabel(service.trendPct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{service.doctorCount}</TableCell>
                    <TableCell><Button variant="outline" size="sm" className="min-h-11" onClick={(event) => { detailTriggerRef.current = event.currentTarget; setSelectedService(service); }} aria-label={`View ${service.serviceName} details`}>View details</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {sortedServices.map((service) => (
              <article key={service.serviceId} data-testid="service-performance-card" className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-900">{service.serviceName}</h3><p className="text-sm text-slate-500">{service.volume} performed · Revenue {formatRM(service.revenue)}</p></div>
                  {service.missingCostCount > 0 ? <Badge variant="outline" className="border-amber-300 text-amber-800">Missing cost</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-slate-600">Trend: {serviceTrendLabel(service.trendPct)}</p>
                <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={(event) => { detailTriggerRef.current = event.currentTarget; setSelectedService(service); }} aria-label={`View ${service.serviceName} mobile details`}>View details</Button>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
      <ServiceDetail service={selectedService} open={selectedService !== null} onOpenChange={(open) => { if (!open) setSelectedService(null); }} startDate={startDate} endDate={endDate} viewerScope={viewerScope} filters={filters} canSeeNamedDoctors={canSeeNamedDoctors} returnFocusRef={detailTriggerRef} />
    </>
  );
}
