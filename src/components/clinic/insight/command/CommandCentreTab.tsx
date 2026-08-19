import { Link } from 'react-router-dom';

import type { FinancialControlSummary } from '@/lib/clinic/financialControl';
import type { ClinicHealthAlert } from '@/lib/clinic/insight/alerts';
import {
  buildCommandActions,
  type CommandAttendancePeriod,
} from '@/lib/clinic/insight/commandCentre';
import {
  evaluateDataConfidence,
  type DataConfidence as DataConfidenceModel,
} from '@/lib/clinic/insight/dataConfidence';
import type { ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';
import { CommandActionCentre } from './CommandActionCentre';
import { CommandKpiStrip, type CommandKpi } from './CommandKpiStrip';
import { DataConfidence } from '../shared/DataConfidence';

type CommandCentreTabProps = {
  healthMetrics: ClinicHealthMetrics;
  healthAlerts: ClinicHealthAlert[];
  financialSummary: FinancialControlSummary | null;
  attendancePeriods: CommandAttendancePeriod[];
  averageWaitingMinutes: number | null;
  attendanceConfidence: DataConfidenceModel;
  clinicLastRefreshedAt?: string | null;
  asOfDate?: string;
  clinicSourceFailed?: boolean;
  financialSourceFailed?: boolean;
};

function number(value: number): string {
  return value.toLocaleString('en-MY');
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Unavailable'
    : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CommandCentreTab({
  healthMetrics,
  healthAlerts,
  financialSummary,
  attendancePeriods,
  averageWaitingMinutes,
  attendanceConfidence,
  clinicLastRefreshedAt = null,
  asOfDate,
  clinicSourceFailed = false,
  financialSourceFailed = false,
}: CommandCentreTabProps) {
  const clinicMissingRows = healthMetrics.dataQuality.completedWithoutPayment
    + healthMetrics.dataQuality.panelVisitWithoutPanel
    + healthMetrics.dataQuality.consultationWithoutFee;
  const clinicConfidence = evaluateDataConfidence({
    expectedRows: healthMetrics.visits.registered,
    observedRows: Math.max(healthMetrics.visits.registered - clinicMissingRows, 0),
    missingAttributionRows: clinicMissingRows,
    lastRefreshedAt: clinicLastRefreshedAt,
    source: 'clinic-health',
    dateBasis: 'Queue entry registration date in Asia/Kuala_Lumpur',
    sourceFailed: clinicSourceFailed,
  });
  const financialConfidence = evaluateDataConfidence({
    expectedRows: financialSummary?.period.completedVisits ?? null,
    observedRows: financialSummary
      ? Math.max(financialSummary.period.completedVisits - financialSummary.period.incompleteVisits, 0)
      : 0,
    missingAttributionRows: financialSummary?.period.incompleteVisits ?? 0,
    incompleteCostRows: financialSummary?.period.missingCostItems ?? 0,
    lastRefreshedAt: financialSummary?.generated_at ?? null,
    source: 'financial-control',
    dateBasis: 'Visit completion and financial event dates in Asia/Kuala_Lumpur',
    sourceFailed: financialSummary === null || financialSourceFailed,
  });
  const actions = buildCommandActions({
    financialAlerts: financialSummary?.alerts ?? [],
    clinicAlerts: healthAlerts,
    lastRefreshedAt: financialSummary?.generated_at ?? clinicLastRefreshedAt,
    asOfDate,
    clinicSourceFailed,
    financialSourceFailed,
  });
  const criticalActionCount = actions
    .filter((action) => action.severity === 'critical')
    .reduce((total, action) => total + action.count, 0);
  const kpis: CommandKpi[] = [
    { key: 'patients', label: 'Total patients', value: number(healthMetrics.visits.registered), definition: 'Queue entries registered in the selected period.' },
    { key: 'waiting', label: 'Average waiting', value: averageWaitingMinutes === null ? 'Unavailable' : `${Math.round(averageWaitingMinutes)} min`, definition: 'Measured wait across called visits.' },
    { key: 'billing', label: 'Visit billing', value: money(financialSummary?.period.billedRevenue), definition: 'Completed-visit billing from Financial Control.' },
    { key: 'collections', label: 'Patient collections', value: money(financialSummary?.period.cashCollected), definition: 'Cash collected in the period from Financial Control.' },
    { key: 'panels', label: 'Panel receivable', value: money(financialSummary?.reconciliation.panelOutstanding), definition: 'Open panel balance as of the selected period end.' },
    { key: 'actions', label: 'Critical actions', value: number(criticalActionCount), definition: 'Items currently marked critical; no composite score.' },
  ];
  const inProgress = Math.max(
    healthMetrics.visits.registered - healthMetrics.visits.completed - healthMetrics.visits.cancelled - healthMetrics.visits.noShow,
    0,
  );

  return (
    <div className="space-y-4">
      <CommandKpiStrip kpis={kpis} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <CommandActionCentre actions={actions} />
        <section aria-labelledby="patient-flow-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 id="patient-flow-heading" className="text-base font-semibold text-slate-900">Patient flow</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ['Registered', healthMetrics.visits.registered],
              ['Completed', healthMetrics.visits.completed],
              ['In progress', inProgress],
              ['Cancelled', healthMetrics.visits.cancelled],
              ['No-show', healthMetrics.visits.noShow],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="attendance-summary-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="attendance-summary-heading" className="text-base font-semibold text-slate-900">Attendance by period</h2>
            <p className="mt-1 text-xs text-slate-500">Compact selected-period attendance; detailed heatmaps remain in Planning.</p>
          </div>
          <Link to="/clinic/insight?section=planning" className="text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">View planning analysis</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {attendancePeriods.map((period) => {
            const maxVisits = Math.max(...attendancePeriods.map((entry) => entry.visits), 1);
            const barWidth = period.visits === 0 ? 0 : Math.max(4, Math.round((period.visits / maxVisits) * 100));
            return (
              <article key={period.key} data-testid="attendance-period" className="rounded-lg bg-slate-50 p-3">
                <h3 className="text-xs font-semibold text-slate-600">{period.label}</h3>
                <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">{number(period.visits)} visits</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${barWidth}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{period.averageWaitingMinutes === null ? 'Waiting unavailable' : `${Math.round(period.averageWaitingMinutes)} min average wait`}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="data-confidence-heading" className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h2 id="data-confidence-heading" className="text-base font-semibold text-slate-900">Data confidence</h2>
        <p className="mt-1 text-xs text-slate-500">Open a source to review its definition, date basis, refresh time, and missing-row count.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <DataConfidence confidence={clinicConfidence} label="Patient flow" definition="Queue entries registered and their latest workflow status." />
          <DataConfidence confidence={financialConfidence} label="Financial control" definition="Visit billing, collected cash, panel receivable, and financial exceptions." />
          <DataConfidence confidence={attendanceConfidence} label="Attendance" definition="Clinical visits and measured waiting grouped into four operating periods." />
        </div>
      </section>
    </div>
  );
}
