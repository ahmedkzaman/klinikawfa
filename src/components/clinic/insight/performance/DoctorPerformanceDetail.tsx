import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';

import { DoctorClinicalActivity } from '@/components/clinic/insight/DoctorClinicalActivity';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InsightPerformanceDoctor, InsightPerformanceReport } from '@/lib/clinic/insight/performance';
import type { InsightPerformanceFilters, InsightPerformanceViewerScope } from '@/hooks/clinic/useInsightPerformance';
import { useInsightPerformanceDetail } from '@/hooks/clinic/useInsightPerformanceDetail';

type DoctorPerformanceDetailProps = {
  doctor: InsightPerformanceDoctor | null;
  report: InsightPerformanceReport;
  startDate: Date;
  endDate: Date;
  canLoadClinicalActivity: boolean;
  viewerScope: InsightPerformanceViewerScope;
  filters: InsightPerformanceFilters;
  onClose: () => void;
};

const formatRM = (value: number | null) => value == null
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPaymentType = (value: 'self_pay' | 'panel') => {
  if (value === 'self_pay') return 'Self-pay';
  if (value === 'panel') return 'Panel';
  return 'Unavailable';
};

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export function DoctorPerformanceDetail({
  doctor,
  report,
  startDate,
  endDate,
  canLoadClinicalActivity,
  viewerScope,
  filters,
  onClose,
}: DoctorPerformanceDetailProps) {
  const [activeTab, setActiveTab] = useState('workload');
  const triggerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (doctor) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [doctor]);

  useEffect(() => setActiveTab('workload'), [doctor?.doctorId]);

  return (
    <Sheet open={doctor !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        {doctor ? (
          <>
            <SheetHeader>
              <SheetTitle>{doctor.doctorName} performance details</SheetTitle>
              <SheetDescription>Factual workload, financial contribution, activity, and record-completeness context.</SheetDescription>
            </SheetHeader>
            <DoctorDetailTabs doctor={doctor} report={report} startDate={startDate} endDate={endDate} viewerScope={viewerScope} filters={filters} canLoadClinicalActivity={canLoadClinicalActivity} activeTab={activeTab} setActiveTab={setActiveTab} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DoctorDetailTabs({ doctor, report, startDate, endDate, viewerScope, filters, canLoadClinicalActivity, activeTab, setActiveTab }: {
  doctor: InsightPerformanceDoctor; report: InsightPerformanceReport; startDate: Date; endDate: Date;
  viewerScope: InsightPerformanceViewerScope; filters: InsightPerformanceFilters; canLoadClinicalActivity: boolean; activeTab: string; setActiveTab: (tab: string) => void;
}) {
  const query = useInsightPerformanceDetail(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), 'doctor', doctor.doctorId, viewerScope, filters);
  const detail = query.data?.kind === 'doctor' ? query.data : null;
  return (
    <>
      {query.isLoading ? <div role="status" className="mt-4 rounded-xl border p-4 text-sm">Loading doctor details…</div> : null}
      {query.isError ? <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Doctor details could not be loaded. <button type="button" className="underline" onClick={() => { void query.refetch(); }}>Retry</button></div> : null}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-5">
              <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
                <TabsTrigger className="min-h-11" value="workload" onClick={() => setActiveTab('workload')}>Workload</TabsTrigger>
                <TabsTrigger className="min-h-11" value="financial" onClick={() => setActiveTab('financial')}>Financial</TabsTrigger>
                <TabsTrigger className="min-h-11" value="clinical" onClick={() => setActiveTab('clinical')}>Clinical activity</TabsTrigger>
                <TabsTrigger className="min-h-11" value="quality" onClick={() => setActiveTab('quality')}>Quality guardrails</TabsTrigger>
              </TabsList>
              <TabsContent value="workload">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Metric label="Completed clinical visits" value={String(doctor.completedVisits)} />
                  <Metric label="Average measured visit duration" value={detail?.averageVisitDurationMinutes == null ? 'Unavailable' : `${detail.averageVisitDurationMinutes.toFixed(1)} min`} note={detail ? `${detail.durationMeasuredVisits} visit(s) measured from called to completion timestamps.` : undefined} />
                  <Metric label="Rostered hours" value={`${doctor.rosteredHours.toFixed(1)} h`} note="Saved S1 5 h · S2 5 h · S3 4 h" />
                  <Metric label="Patients per rostered hour" value={doctor.patientsPerHour == null ? 'Unavailable' : doctor.patientsPerHour.toFixed(2)} />
                </dl>
                {detail ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><h3 className="text-sm font-medium">Actual visits by shift</h3><ul className="mt-2 text-sm text-slate-600">{detail.visitsByShift.map((row) => <li key={`${row.date}-${row.shift}`}>{row.date} · {row.shift}: {row.visits}</li>)}</ul></div><div><h3 className="text-sm font-medium">Payment mix</h3><ul className="mt-2 text-sm text-slate-600">{detail.paymentMix.map((row) => <li key={row.paymentType}>{formatPaymentType(row.paymentType)}: {row.visits} visits</li>)}</ul></div></div> : null}
              </TabsContent>
              <TabsContent value="financial">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Metric label="Visit billing" value={formatRM(detail?.financial.revenue ?? doctor.visitBilling)} note="Saved charged work, not collected cash." />
                  <Metric label="COGS" value={formatRM(detail?.financial.cogs ?? null)} />
                  <Metric label="Gross profit" value={formatRM(detail?.financial.grossProfit ?? null)} />
                  <Metric label="Margin" value={detail?.financial.marginPct == null ? 'Unavailable' : `${detail.financial.marginPct.toFixed(1)}%`} />
                  <Metric label="Revenue per rostered hour" value={formatRM(detail?.financial.revenuePerHour ?? doctor.revenuePerHour)} />
                  <Metric label="Revenue per visit" value={formatRM(detail?.financial.revenuePerVisit ?? null)} />
                  <Metric label="Attribution confidence" value={doctor.missingAttribution > 0 ? 'Partial' : 'Reliable'} note={doctor.missingAttribution > 0 ? `${doctor.missingAttribution} activity record(s) lack doctor attribution.` : 'No missing doctor attribution in this row.'} />
                </dl>
                {detail?.financial.missingCostCount ? <p className="mt-4 text-sm text-amber-700">{detail.financial.missingCostCount} item(s) have missing cost; COGS, profit, and margin remain unavailable.</p> : null}
              </TabsContent>
              <TabsContent value="clinical">
                {canLoadClinicalActivity && doctor.doctorId ? (
                  <><DoctorClinicalActivity startDate={startDate} endDate={endDate} doctorId={doctor.doctorId} detailOnly />{detail ? <div className="mt-4 grid gap-4 sm:grid-cols-3"><div><h3 className="text-sm font-medium">Procedures</h3><ul className="text-sm text-slate-600">{detail.procedures.map((row) => <li key={row.name}>{row.name}: {row.quantity} · charged {formatRM(row.charged)} · COGS {formatRM(row.cogs)} · profit {formatRM(row.grossProfit)}</li>)}</ul></div><div><h3 className="text-sm font-medium">Diagnoses</h3><ul className="text-sm text-slate-600">{detail.diagnoses.map((row) => <li key={row.name}>{row.name}: {row.visits}</li>)}</ul></div><div><h3 className="text-sm font-medium">Medicines</h3><ul className="text-sm text-slate-600">{detail.medicines.map((row) => <li key={row.name}>{row.name}: {row.quantity}</li>)}</ul></div></div> : null}</>
                ) : (
                  <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600" role="status">
                    <p className="font-medium text-slate-900">Clinical activity summary</p>
                    <p className="mt-1">{doctor.procedures} procedures and {doctor.documents} documents are included in the secured performance aggregate.</p>
                    <p className="mt-2">Visit-level patient, queue, and charged-item records are restricted for this account.</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="quality">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Metric label="Missing consultation notes" value={detail ? String(detail.quality.missingConsultationNotes) : 'Unavailable'} />
                  <Metric label="Missing diagnosis" value={detail ? String(detail.quality.missingDiagnosis) : 'Unavailable'} />
                  <Metric label="Missing dispense note" value={detail ? String(detail.quality.missingDispenseNote) : 'Unavailable'} />
                  <Metric label="Returned offline consultations" value={detail ? String(detail.quality.returnedOfflineConsultations) : 'Unavailable'} />
                  <Metric label="Incomplete doctor attribution" value={detail ? String(detail.quality.incompleteDoctorAttribution) : String(doctor.missingAttribution)} />
                  <Metric label="Bills corrected after completion" value={detail ? String(detail.quality.billsCorrectedAfterCompletion) : 'Unavailable'} />
                </dl>
                <p className="mt-4 text-sm text-slate-500">These are workflow and completeness exceptions, not medical-quality judgements.</p>
              </TabsContent>
      </Tabs>
      {!detail && !query.isLoading && !query.isError ? <p className="mt-3 text-sm text-slate-500">No doctor detail is available for this period.</p> : null}
      <span className="sr-only">Clinic quality context: {report.quality.missingAttribution} missing attribution records.</span>
    </>
  );
}
