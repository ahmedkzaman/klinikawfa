import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Clock3, FileText, Gauge, ReceiptText, Stethoscope, UsersRound, WalletCards } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useInsightPerformance, type InsightPerformanceFilters, type InsightPerformanceViewerScope } from '@/hooks/clinic/useInsightPerformance';
import type { InsightAccess } from '@/lib/clinic/insight/insightAccess';
import type { InsightPerformanceDoctor, InsightPerformanceReport } from '@/lib/clinic/insight/performance';
import {
  buildDoctorPerformanceCsv,
  buildServicePerformanceCsv,
} from '@/lib/clinic/insight/performanceExports';
import { downloadInsightCsv } from '@/lib/clinic/insight/exports';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';
import { InsightState } from '../shared/InsightState';
import { useInsightExportRegistration } from '../InsightShell';
import type { InsightExportItem } from '../shared/InsightExportMenu';
import { DoctorPerformanceTable } from './DoctorPerformanceTable';
import { DoctorPerformanceDetail } from './DoctorPerformanceDetail';
import { ServicePerformanceTable } from './ServicePerformanceTable';

export type PerformanceViewerRole = string | null;

export type PerformanceTabProps = {
  startDate: Date;
  endDate: Date;
  access: InsightAccess;
  viewerRole: PerformanceViewerRole;
  viewerScope: InsightPerformanceViewerScope | null;
  enabled?: boolean;
  comparisonEnabled?: boolean;
  selectedDoctorId: string | null;
  onDoctorChange: (doctorId: string | null, options?: { replace?: boolean }) => void;
};

const formatRM = (value: number | null) => value == null
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function restrictedState(label = 'Performance access restricted') {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{label}. This account cannot open Clinic Insight performance.</div>;
}

export function PerformanceTab(props: PerformanceTabProps) {
  if (!props.access.canOpenInsight) return restrictedState();
  if (!props.viewerScope) return restrictedState('Performance identity unavailable');
  return <PerformanceReport {...props} viewerScope={props.viewerScope} />;
}

function visibleDoctors(report: InsightPerformanceReport, access: InsightAccess, viewerRole: PerformanceViewerRole) {
  if (access.canSeeNamedDoctors) return report.doctors;
  if (viewerRole === 'resident_doctor') {
    if (!access.ownDoctorId) return report.doctors.filter((doctor) => doctor.doctorId === null);
    return report.doctors.filter((doctor) => doctor.doctorId === null || doctor.doctorId === access.ownDoctorId);
  }
  return report.doctors.filter((doctor) => doctor.doctorId === null);
}

function PerformanceReport(props: PerformanceTabProps & { viewerScope: InsightPerformanceViewerScope }) {
  const {
    startDate, endDate, access, viewerRole, viewerScope, enabled = true, comparisonEnabled = false,
    selectedDoctorId, onDoctorChange,
  } = props;
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<InsightPerformanceFilters['paymentType']>('all');
  const [activityFilter, setActivityFilter] = useState<InsightPerformanceFilters['activityType']>('all');
  const requestedDoctorId = viewerRole === 'resident_doctor'
    ? access.ownDoctorId
    : doctorFilter === 'all' ? null : doctorFilter;
  const filters = useMemo<InsightPerformanceFilters>(() => ({
    // Always fetch the clinic-wide report. The unfiltered RPC is ~10-14s and
    // already contains every doctor's row, so the doctor selector filters
    // client-side below. The per-doctor filtered RPC path times out (>60s) on
    // live data for some doctors (e.g. Izzat) because the services/documents
    // CTE stack cannot push the doctor predicate down. The drill-down panel
    // fetches its own detail via useInsightPerformanceDetail.
    doctorId: null,
    paymentType: paymentFilter,
    activityType: activityFilter,
    includeComparison: comparisonEnabled,
  }), [activityFilter, comparisonEnabled, paymentFilter]);
  const query = useInsightPerformance(
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd'),
    viewerScope,
    { enabled },
    filters,
  );
  const report = query.data;
  const doctors = useMemo(() => {
    const visible = report ? visibleDoctors(report, access, viewerRole) : [];
    if (!requestedDoctorId) return visible;
    // Keep the anonymized clinic benchmark row (doctorId === null) alongside
    // the selected doctor's row.
    return visible.filter((doctor) => doctor.doctorId === null || doctor.doctorId === requestedDoctorId);
  }, [access, report, requestedDoctorId, viewerRole]);
  const services = useMemo(() => report && access.canSeeServicePerformance ? report.services : [], [access.canSeeServicePerformance, report]);
  const showDoctorPerformance = viewerRole !== 'ops_staff' && viewerRole !== 'operations' && doctors.length > 0;
  const showFinancialColumns = access.canSeeNamedDoctors || viewerRole === 'resident_doctor';
  const selectedDoctor = selectedDoctorId
    ? doctors.find((doctor) => doctor.doctorId === selectedDoctorId) ?? null
    : null;

  useEffect(() => {
    if (report && selectedDoctorId && !selectedDoctor) onDoctorChange(null, { replace: true });
  }, [onDoctorChange, report, selectedDoctor, selectedDoctorId]);

  const period = `${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}`;
  const downloadDoctors = useCallback(() => {
    if (!report || doctors.length === 0) return;
    downloadInsightCsv(buildDoctorPerformanceCsv({
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      report,
      filters,
    }, doctors), `doctor-performance-${period}.csv`);
  }, [doctors, endDate, filters, period, report, startDate]);
  const downloadServices = useCallback(() => {
    if (!report || services.length === 0) return;
    downloadInsightCsv(buildServicePerformanceCsv({
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      report,
      filters,
    }, services), `service-performance-${period}.csv`);
  }, [endDate, filters, period, report, services, startDate]);
  const exportItems = useMemo<InsightExportItem[]>(() => {
    const items: InsightExportItem[] = [];
    if (showDoctorPerformance) items.push({
      id: 'doctor-performance-csv', label: 'Doctor performance CSV', download: downloadDoctors,
      disabled: !report || doctors.length === 0,
      disabledReason: 'No permitted doctor performance rows are available for this period.',
    });
    if (access.canSeeServicePerformance) items.push({
      id: 'service-performance-csv', label: 'Service performance CSV', download: downloadServices,
      disabled: !report || services.length === 0,
      disabledReason: 'No service performance rows are available for this period.',
    });
    return items;
  }, [access.canSeeServicePerformance, doctors.length, downloadDoctors, downloadServices, report, services.length, showDoctorPerformance]);
  useInsightExportRegistration('insight-performance-report', exportItems);

  if (query.isLoading && !report) return <InsightState state="loading" label="Loading clinic performance…" />;
  if (query.isError && !report) return <InsightState state="error" label="Clinic performance" error={query.error} onRetry={() => { void query.refetch(); }} retryLabel="Retry clinic performance" />;
  if (!report) return <InsightState state="empty" label="No performance data is available for this period." />;

  const isEmpty = report.clinic.completedVisits === 0
    && report.clinic.procedures === 0
    && report.clinic.documents === 0
    && report.services.length === 0;
  if (isEmpty) return <InsightState state="empty" label="No completed clinical activity is available for this period." />;

  const stale = Date.now() - Date.parse(report.generatedAt) > 15 * 60 * 1_000;
  const partial = report.confidence.state !== 'reliable' || query.isFetching || query.isError || stale;
  const stateLabel = query.isFetching
    ? 'Updating performance data; previous results remain visible.'
    : query.isError
      ? 'Partial data: the latest refresh failed and previous results remain visible.'
      : report.confidence.state === 'partial'
        ? 'Partial data: some performance metrics have completeness limitations.'
        : report.confidence.state === 'insufficient'
          ? 'Insufficient data: use these metrics with caution.'
          : stale
            ? 'Stale data: the last generated report is more than 15 minutes old.'
          : 'Performance data is reliable and up to date.';

  const canOpenDoctor = (doctor: InsightPerformanceDoctor) => doctor.doctorId !== null
    && (access.canSeeNamedDoctors || viewerRole === 'resident_doctor');

  return (
    <div className="min-w-0 space-y-4">
      {partial ? (
        <InsightState
          state="partial"
          label={stateLabel}
          onRetry={query.isError ? () => { void query.refetch(); } : undefined}
          retryLabel="Retry clinic performance"
        />
      ) : <InsightState state="success" label={stateLabel} />}
      <section aria-label="Performance filters" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        {access.canSeeNamedDoctors ? (
          <label className="text-xs font-medium text-slate-600">Doctor
            <select aria-label="Filter performance by doctor" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}>
              <option value="all">All doctors</option>
              {doctors.filter((doctor) => doctor.doctorId).map((doctor) => <option key={doctor.doctorId!} value={doctor.doctorId!}>{doctor.doctorName} — filter</option>)}
            </select>
          </label>
        ) : <div className="text-xs text-slate-500">Doctor filter: {viewerRole === 'resident_doctor' ? 'Your own activity' : 'Names restricted'}</div>}
        <label className="text-xs font-medium text-slate-600">Payment
          <select aria-label="Filter performance by payment" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as InsightPerformanceFilters['paymentType'])}>
            <option value="all">All payments</option><option value="self_pay">Self-pay</option><option value="panel">Panel</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Activity
          <select aria-label="Filter performance by activity" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as InsightPerformanceFilters['activityType'])}>
            <option value="all">All activity</option><option value="consultation">Consultations</option><option value="procedure">Procedures</option><option value="document">Documents</option>
          </select>
        </label>
      </section>
      <ClinicPerformanceOverview report={report} />
      {showDoctorPerformance ? (
        <DoctorPerformanceTable
          doctors={doctors}
          showFinancialColumns={showFinancialColumns}
          canOpenDoctor={canOpenDoctor}
          onOpenDoctor={onDoctorChange}
        />
      ) : null}
      {access.canSeeServicePerformance ? (
        services.length > 0
          ? <ServicePerformanceTable services={services} startDate={startDate} endDate={endDate} viewerScope={viewerScope} filters={filters} canSeeNamedDoctors={access.canSeeNamedDoctors} />
          : <InsightState state="empty" label="No service performance is available for this period." />
      ) : null}
      <DoctorPerformanceDetail
        doctor={selectedDoctor}
        report={report}
        startDate={startDate}
        endDate={endDate}
        canLoadClinicalActivity={access.canSeeNamedDoctors}
        viewerScope={viewerScope}
        filters={filters}
        onClose={() => onDoctorChange(null)}
      />
    </div>
  );
}

function ClinicPerformanceOverview({ report }: { report: InsightPerformanceReport }) {
  const { clinic, confidence, quality } = report;
  const selfPayPct = clinic.completedVisits > 0 ? (clinic.selfPayVisits / clinic.completedVisits) * 100 : null;
  const panelPct = clinic.completedVisits > 0 ? (clinic.panelVisits / clinic.completedVisits) * 100 : null;
  const metrics = [
    { label: 'Completed visits', value: String(clinic.completedVisits), icon: Stethoscope },
    { label: 'Unique patients', value: String(clinic.uniquePatients), icon: UsersRound },
    { label: 'Rostered hours', value: `${clinic.rosteredHours.toFixed(1)} h`, icon: Clock3 },
    { label: 'Patients / hour', value: clinic.patientsPerHour == null ? 'Unavailable' : clinic.patientsPerHour.toFixed(2), icon: Gauge },
    { label: 'Visit billing', value: formatRM(clinic.visitBilling), icon: ReceiptText },
    { label: 'Revenue / hour', value: formatRM(clinic.revenuePerHour), icon: WalletCards },
    { label: 'Gross profit', value: formatRM(clinic.grossProfit), icon: WalletCards },
    { label: 'Procedures', value: String(clinic.procedures), icon: Stethoscope },
    { label: 'Documents issued', value: String(clinic.documents), icon: FileText },
    { label: 'Payment mix', value: selfPayPct == null || panelPct == null ? 'Unavailable' : `${selfPayPct.toFixed(0)}% self-pay · ${panelPct.toFixed(0)}% panel`, icon: ReceiptText },
  ];
  const confidenceLabel = confidence.state === 'reliable' ? 'Reliable' : confidence.state === 'partial' ? 'Partial' : 'Insufficient';
  return (
    <Card className={bento}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className={bentoHeader}>Clinic performance</h2><p className="text-xs text-slate-500">Completed clinical activity using Malaysia-local dates and saved charged values.</p></div>
          <Badge variant="outline" className={confidence.state === 'reliable' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-800'}>{confidenceLabel}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-medium text-slate-900"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Data completeness</div>
          <p className="mt-1">{quality.missingAttribution} record{quality.missingAttribution === 1 ? '' : 's'} missing doctor attribution · {quality.missingCostCount} item{quality.missingCostCount === 1 ? '' : 's'} missing cost · {quality.excludedVoidedPayments} voided payment{quality.excludedVoidedPayments === 1 ? '' : 's'} excluded.</p>
          <p className="mt-1 text-xs text-slate-500">Generated {new Date(report.generatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} · visit completion, document issue, and saved roster sources.</p>
        </div>
      </CardContent>
    </Card>
  );
}
