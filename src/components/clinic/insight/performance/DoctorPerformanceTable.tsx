import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { InsightPerformanceDoctor } from '@/lib/clinic/insight/performance';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';

type DoctorSortKey = 'completedVisits' | 'rosteredHours' | 'patientsPerHour' | 'visitBilling' | 'revenuePerHour' | 'cogs' | 'grossProfit' | 'marginPct' | 'procedures' | 'documents';

type DoctorPerformanceTableProps = {
  doctors: InsightPerformanceDoctor[];
  showFinancialColumns: boolean;
  canOpenDoctor: (doctor: InsightPerformanceDoctor) => boolean;
  onOpenDoctor: (doctorId: string) => void;
};

const formatRM = (value: number | null) => value == null
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatRate = (value: number | null) => value == null ? 'Unavailable' : value.toFixed(2);
const formatMargin = (value: number | null) => value == null ? 'Unavailable' : `${value.toFixed(1)}%`;

function Definition({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex min-h-6 min-w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Define ${label}`}>
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export function DoctorPerformanceTable({
  doctors,
  showFinancialColumns,
  canOpenDoctor,
  onOpenDoctor,
}: DoctorPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<DoctorSortKey>('completedVisits');
  const [descending, setDescending] = useState(true);
  const sortedDoctors = useMemo(() => [...doctors].sort((left, right) => {
    const leftValue = left[sortKey] ?? Number.NEGATIVE_INFINITY;
    const rightValue = right[sortKey] ?? Number.NEGATIVE_INFINITY;
    const difference = Number(leftValue) - Number(rightValue);
    if (difference !== 0) return descending ? -difference : difference;
    return left.doctorName.localeCompare(right.doctorName);
  }), [descending, doctors, sortKey]);

  const changeSort = (next: DoctorSortKey) => {
    if (next === sortKey) setDescending((current) => !current);
    else {
      setSortKey(next);
      setDescending(true);
    }
  };
  const sortIcon = (key: DoctorSortKey) => key !== sortKey
    ? <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
    : descending
      ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      : <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />;
  const sortableHeader = (label: string, key: DoctorSortKey, definition?: string) => (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" className="h-9 px-1.5 text-[11px] font-semibold uppercase tracking-wider" onClick={() => changeSort(key)} aria-label={`Sort doctors by ${label}`}>
        {label}{sortIcon(key)}
      </Button>
      {definition ? <Definition label={label} text={definition} /> : null}
    </div>
  );
  const ariaSort = (key: DoctorSortKey) => sortKey !== key ? 'none' as const : descending ? 'descending' as const : 'ascending' as const;

  return (
    <TooltipProvider>
      <Card className={bento}>
        <CardContent className="min-w-0 p-4 sm:p-6">
          <div className="mb-3">
            <h2 className={bentoHeader}>Doctor performance</h2>
            <p className="text-xs text-slate-500">Workload and contribution metrics, without a composite score or rank.</p>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Doctor</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('completedVisits')}>{sortableHeader('Completed visits', 'completedVisits')}</TableHead>
                  <TableHead className="text-right">Unique patients</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('rosteredHours')}>{sortableHeader('Rostered hours', 'rosteredHours', 'Saved S1, S2, and S3 roster shifts converted to 5, 5, and 4 hours.')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('patientsPerHour')}>{sortableHeader('Patients / hour', 'patientsPerHour')}</TableHead>
                  {showFinancialColumns ? <TableHead className="text-right" aria-sort={ariaSort('visitBilling')}>{sortableHeader('Visit billing', 'visitBilling', 'Saved active consultation-item charges for completed clinical visits; this is billed work, not cash collected.')}</TableHead> : null}
                  {showFinancialColumns ? <TableHead className="text-right" aria-sort={ariaSort('revenuePerHour')}>{sortableHeader('Revenue / hour', 'revenuePerHour')}</TableHead> : null}
                  {showFinancialColumns ? <TableHead className="text-right" aria-sort={ariaSort('cogs')}>{sortableHeader('COGS', 'cogs', 'Cost of goods sold from dispensed inventory items with a recorded purchase cost. Items missing a cost are excluded from the total.')}</TableHead> : null}
                  {showFinancialColumns ? <TableHead className="text-right" aria-sort={ariaSort('grossProfit')}>{sortableHeader('Gross profit', 'grossProfit', 'Visit billing minus cost of goods sold. Partial when some dispensed items have no recorded cost.')}</TableHead> : null}
                  {showFinancialColumns ? <TableHead className="text-right" aria-sort={ariaSort('marginPct')}>{sortableHeader('Margin', 'marginPct', 'Gross profit as a percentage of visit billing. Partial when some dispensed items have no recorded cost.')}</TableHead> : null}
                  <TableHead className="text-right" aria-sort={ariaSort('procedures')}>{sortableHeader('Procedures', 'procedures')}</TableHead>
                  <TableHead className="text-right" aria-sort={ariaSort('documents')}>{sortableHeader('Documents', 'documents')}</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">Attribution <Definition label="attribution" text="Completed activity linked to a doctor. Missing attribution is never treated as zero." /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDoctors.map((doctor) => (
                  <TableRow key={doctor.doctorId ?? 'clinic-benchmark'} data-testid="doctor-performance-row">
                    <TableCell className="font-medium text-slate-900">
                      {doctor.doctorId && canOpenDoctor(doctor) ? (
                        <Button variant="ghost" className="min-h-11 justify-start px-2 text-left" onClick={() => onOpenDoctor(doctor.doctorId!)} aria-label={`View ${doctor.doctorName} performance details`}>
                          {doctor.doctorName}
                        </Button>
                      ) : doctor.doctorName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{doctor.completedVisits}</TableCell>
                    <TableCell className="text-right tabular-nums">{doctor.uniquePatients}</TableCell>
                    <TableCell className="text-right tabular-nums">{doctor.rosteredHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRate(doctor.patientsPerHour)}</TableCell>
                    {showFinancialColumns ? <TableCell className="text-right tabular-nums">{formatRM(doctor.visitBilling)}</TableCell> : null}
                    {showFinancialColumns ? <TableCell className="text-right tabular-nums">{formatRM(doctor.revenuePerHour)}</TableCell> : null}
                    {showFinancialColumns ? <TableCell className="text-right tabular-nums">{formatRM(doctor.cogs)}</TableCell> : null}
                    {showFinancialColumns ? <TableCell className="text-right tabular-nums">{formatRM(doctor.grossProfit)}{(doctor.missingCostCount ?? 0) > 0 ? <span className="ml-1 align-middle text-amber-600" title={`${doctor.missingCostCount} dispensed item(s) have no recorded cost; COGS, gross profit, and margin are partial.`} aria-label="Partial cost data">*</span> : null}</TableCell> : null}
                    {showFinancialColumns ? <TableCell className="text-right tabular-nums">{formatMargin(doctor.marginPct)}</TableCell> : null}
                    <TableCell className="text-right tabular-nums">{doctor.procedures}</TableCell>
                    <TableCell className="text-right tabular-nums">{doctor.documents}</TableCell>
                    <TableCell className="text-right">{doctor.missingAttribution > 0 ? `${doctor.missingAttribution} missing` : 'Complete'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {sortedDoctors.map((doctor) => (
              <article key={doctor.doctorId ?? 'clinic-benchmark-mobile'} data-testid="doctor-performance-card" className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900" aria-label={doctor.doctorName}><span>{doctor.doctorName.slice(0, 1)}</span><span>{doctor.doctorName.slice(1)}</span></h3><span className="text-sm font-medium tabular-nums">{doctor.completedVisits} visits</span></div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-slate-500">Rostered hours</dt><dd>{doctor.rosteredHours.toFixed(1)}</dd></div><div><dt className="text-xs text-slate-500">Patients / hour</dt><dd>{formatRate(doctor.patientsPerHour)}</dd></div>{showFinancialColumns ? <div><dt className="text-xs text-slate-500">Visit billing</dt><dd>{formatRM(doctor.visitBilling)}</dd></div> : null}{showFinancialColumns ? <div><dt className="text-xs text-slate-500">Gross profit · margin</dt><dd>{formatRM(doctor.grossProfit)} · {formatMargin(doctor.marginPct)}{(doctor.missingCostCount ?? 0) > 0 ? <span className="ml-1 text-amber-600" title="Partial cost data">*</span> : null}</dd></div> : null}<div><dt className="text-xs text-slate-500">Procedures · documents</dt><dd>{doctor.procedures} · {doctor.documents}</dd></div></dl>
                {doctor.doctorId && canOpenDoctor(doctor) ? <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => onOpenDoctor(doctor.doctorId!)} aria-label={`View ${doctor.doctorName} mobile performance details`}>View details</Button> : null}
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
