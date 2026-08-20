/**
 * Insight visual verification harness — dev-only.
 * Mounts the real InsightShell + section tabs with deterministic fixture data
 * (no Supabase, no router) so the rendered UI can be inspected and screenshotted.
 * Mounted from src/insight-preview/main.tsx via vite when INSIGHT_PREVIEW=1.
 */
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { format, subDays } from 'date-fns';

import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { CommandCentreTab } from '@/components/clinic/insight/command/CommandCentreTab';
import { FinanceLedgerSummary } from '@/components/clinic/insight/finance/FinanceLedgerSummary';
import { FinancialSummaryStrip } from '@/components/clinic/insight/management/FinancialSummaryStrip';
import { ClinicPerformanceOverviewFixture } from './fixtures/performanceFixture';
import { DoctorPerformanceTable } from '@/components/clinic/insight/performance/DoctorPerformanceTable';
import { ServicePerformanceTable } from '@/components/clinic/insight/performance/ServicePerformanceTable';
import { InsightState } from '@/components/clinic/insight/shared/InsightState';
import { DataConfidence } from '@/components/clinic/insight/shared/DataConfidence';
import { buildAttendanceSummary } from '@/lib/clinic/insight/commandCentre';
import { evaluateDataConfidence } from '@/lib/clinic/insight/dataConfidence';
import type { FinancialControlSummary } from '@/lib/clinic/financialControl';
import type { ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';
import type { InsightPerformanceDoctor, InsightPerformanceService } from '@/lib/clinic/insight/performance';

const money = (value: number | null | undefined) => value === null || value === undefined
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const healthMetrics: ClinicHealthMetrics = {
  financial: { revenue: 48250, profit: 29100, marginPct: 60.3 },
  visits: { registered: 412, completed: 386, cancelled: 14, noShow: 9 },
  claims: { outstandingAmount: 18900, unsubmittedCount: 3, overdueCount: 5 },
  panelFees: { activePanels: 12, missingDefaultCount: 1, mismatchedVisitCount: 2 },
  inventory: { outOfStockCount: 2, belowReorderCount: 6, expiring60DaysCount: 4 },
  dataQuality: { completedWithoutPayment: 3, panelVisitWithoutPanel: 1, consultationWithoutFee: 0 },
};

const financialSummary: FinancialControlSummary = {
  period: {
    billedRevenue: 48250,
    cashCollected: 31400,
    cohortCollected: 29800,
    olderDebtCollected: 1600,
    collectionRate: 65,
    cogs: 19150,
    grossProfit: 29100,
    grossMarginPct: 60.3,
    cohortOutstanding: 18450,
    totalOutstanding: 37350,
    averageBill: 124.87,
    completedVisits: 386,
    attributionComplete: false,
    costComplete: true,
    incompleteVisits: 4,
    missingCostItems: 0,
  },
  comparison: {
    billedRevenue: 43900,
    cashCollected: 30100,
    cohortCollected: 28400,
    olderDebtCollected: 1700,
    collectionRate: 68,
    cogs: 17900,
    grossProfit: 26000,
    grossMarginPct: 59.2,
    cohortOutstanding: 15400,
    totalOutstanding: 33100,
    averageBill: 118.60,
    completedVisits: 370,
    attributionComplete: true,
    costComplete: true,
    incompleteVisits: 0,
    missingCostItems: 0,
  },
  reconciliation: {
    billedCohort: 48250,
    cashCollected: 31400,
    cohortCollected: 29800,
    olderDebtCollected: 1600,
    discounts: 250,
    taxes: 0,
    refunds: 120,
    adjustments: -80,
    corrections: 40,
    cohortOutstanding: 18450,
    selfPayOutstanding: 390,
    panelOutstanding: 18900,
    totalOutstanding: 19290,
    attributionComplete: false,
    incompleteVisits: 4,
  },
  alerts: [
    { key: 'unpaid_self_pay', severity: 'high', count: 6, amount: 390, oldestAgeDays: 21, attributionComplete: true, incompleteRows: 0 },
    { key: 'unsubmitted_panel', severity: 'critical', count: 3, amount: 2450, oldestAgeDays: 12, attributionComplete: true, incompleteRows: 0 },
    { key: 'overdue_panel', severity: 'critical', count: 5, amount: 8120, oldestAgeDays: 47, attributionComplete: false, incompleteRows: 2 },
    { key: 'missing_cost', severity: 'medium', count: 7, amount: null, oldestAgeDays: null, attributionComplete: true, incompleteRows: 0 },
    { key: 'zero_price', severity: 'medium', count: 2, amount: 0, oldestAgeDays: null, attributionComplete: true, incompleteRows: 0 },
    { key: 'refund_void_correction', severity: 'low', count: 4, amount: 160, oldestAgeDays: 9, attributionComplete: true, incompleteRows: 0 },
  ],
  generated_at: '2026-08-19T14:30:00.000Z',
};

const attendanceCells = [
  { weekday: 1, hour: 9, totalVisits: 24, averageWaitMinutes: 22, waitMeasuredVisits: 24 },
  { weekday: 1, hour: 10, totalVisits: 31, averageWaitMinutes: 35, waitMeasuredVisits: 31 },
  { weekday: 1, hour: 11, totalVisits: 27, averageWaitMinutes: 28, waitMeasuredVisits: 27 },
  { weekday: 1, hour: 15, totalVisits: 22, averageWaitMinutes: 18, waitMeasuredVisits: 22 },
  { weekday: 1, hour: 16, totalVisits: 26, averageWaitMinutes: 25, waitMeasuredVisits: 26 },
  { weekday: 1, hour: 20, totalVisits: 14, averageWaitMinutes: 12, waitMeasuredVisits: 14 },
  { weekday: 3, hour: 9, totalVisits: 19, averageWaitMinutes: 20, waitMeasuredVisits: 19 },
  { weekday: 3, hour: 10, totalVisits: 28, averageWaitMinutes: 31, waitMeasuredVisits: 28 },
  { weekday: 3, hour: 16, totalVisits: 24, averageWaitMinutes: 22, waitMeasuredVisits: 24 },
  { weekday: 5, hour: 10, totalVisits: 34, averageWaitMinutes: 41, waitMeasuredVisits: 34 },
  { weekday: 5, hour: 11, totalVisits: 29, averageWaitMinutes: 33, waitMeasuredVisits: 29 },
  { weekday: 6, hour: 9, totalVisits: 12, averageWaitMinutes: 15, waitMeasuredVisits: 12 },
];

const doctors: InsightPerformanceDoctor[] = [
  { doctorId: 'doctor-1', doctorName: 'Dr. Sarah Lim', completedVisits: 148, uniquePatients: 117, rosteredHours: 92.5, patientsPerHour: 1.6, visitBilling: 18950, revenuePerHour: 204.9, procedures: 34, documents: 21, missingAttribution: 0 },
  { doctorId: 'doctor-2', doctorName: 'Dr. Ahmad Faizal', completedVisits: 126, uniquePatients: 98, rosteredHours: 87, patientsPerHour: 1.45, visitBilling: 15620, revenuePerHour: 179.5, procedures: 27, documents: 18, missingAttribution: 0 },
  { doctorId: 'doctor-3', doctorName: 'Dr. Priya Raj', completedVisits: 84, uniquePatients: 71, rosteredHours: 58.5, patientsPerHour: 1.44, visitBilling: 9870, revenuePerHour: 168.7, procedures: 19, documents: 12, missingAttribution: 1 },
  { doctorId: null, doctorName: 'Clinic benchmark', completedVisits: 28, uniquePatients: 25, rosteredHours: 20, patientsPerHour: 1.4, visitBilling: 3810, revenuePerHour: 190.5, procedures: 6, documents: 4, missingAttribution: 3 },
];

const services: InsightPerformanceService[] = [
  { serviceId: 'service-1', serviceName: 'General consultation', volume: 268, uniquePatients: 204, revenue: 8040, cogs: 0, profit: 8040, marginPct: 100, averagePrice: 30, trendPct: 8.2, doctorCount: 4, missingCostCount: 0 },
  { serviceId: 'service-2', serviceName: 'Nebulisation', volume: 92, uniquePatients: 74, revenue: 4600, cogs: 920, profit: 3680, marginPct: 80, averagePrice: 50, trendPct: 15.4, doctorCount: 3, missingCostCount: 0 },
  { serviceId: 'service-3', serviceName: 'Wound dressing', volume: 61, uniquePatients: 48, revenue: 6100, cogs: 1830, profit: 4270, marginPct: 70, averagePrice: 100, trendPct: -4.1, doctorCount: 2, missingCostCount: 0 },
  { serviceId: 'service-4', serviceName: 'Circumcision (sunat)', volume: 9, uniquePatients: 9, revenue: 2610, cogs: 435, profit: 2175, marginPct: 83.3, averagePrice: 290, trendPct: null, doctorCount: 1, missingCostCount: 0 },
  { serviceId: 'service-5', serviceName: 'Ear syringing', volume: 17, uniquePatients: 14, revenue: 1700, cogs: null, profit: null, marginPct: null, averagePrice: 100, trendPct: 12.5, doctorCount: 2, missingCostCount: 3 },
];

const ledgerSummary = {
  visitBilled: 48250,
  patientCollected: 31400,
  panelBilled: 21350,
  panelReceived: 9800,
  patientOutstanding: 390,
  panelOutstanding: 18900,
};

const commandActions = [
  { key: 'unpaid_self_pay', group: 'Money', severity: 'high', count: 6, amount: 390, oldestDate: '21 days ago', title: 'Unpaid self-pay bills', href: '/clinic/billings', confidence: null },
  { key: 'unsubmitted_panel', group: 'Panels', severity: 'critical', count: 3, amount: 2450, oldestDate: '12 days ago', title: 'Panel claims not submitted', href: '/clinic/panel-claims', confidence: null },
  { key: 'overdue_panel', group: 'Panels', severity: 'critical', count: 5, amount: 8120, oldestDate: '47 days ago', title: 'Overdue panel claims', href: '/clinic/panel-claims', confidence: null },
  { key: 'missing_payment', group: 'Billing', severity: 'critical', count: 3, amount: null, oldestDate: null, title: 'Completed visits without payment', href: '/clinic/queue', confidence: null },
  { key: 'out_of_stock', group: 'Inventory', severity: 'warning', count: 2, amount: null, oldestDate: null, title: 'Items out of stock', href: '/clinic/inventory', confidence: null },
  { key: 'missing_cost', group: 'Clinical records', severity: 'medium', count: 7, amount: null, oldestDate: null, title: 'Items missing cost', href: '/clinic/inventory', confidence: null },
] as never[];

const today = new Date();
const range = { from: subDays(today, 29), to: today };
const attendancePeriods = buildAttendanceSummary(attendanceCells as never[]);
const averageWaiting = attendanceCells.reduce((sum, c) => sum + (c.averageWaitMinutes ?? 0) * c.totalVisits, 0)
  / attendanceCells.reduce((sum, c) => sum + c.waitMeasuredVisits, 0);

const clinicConfidence = evaluateDataConfidence({
  expectedRows: 412,
  observedRows: 406,
  missingAttributionRows: 4,
  lastRefreshedAt: '2026-08-19T14:30:00.000Z',
  source: 'clinic-health',
  dateBasis: 'Queue entry registration date in Asia/Kuala_Lumpur',
  sourceFailed: false,
});
const financialConfidence = evaluateDataConfidence({
  expectedRows: 386,
  observedRows: 382,
  missingAttributionRows: 4,
  incompleteCostRows: 0,
  lastRefreshedAt: '2026-08-19T14:30:00.000Z',
  source: 'financial-control',
  dateBasis: 'Visit completion and financial event dates in Asia/Kuala_Lumpur',
  sourceFailed: false,
});
const attendanceConfidence = evaluateDataConfidence({
  expectedRows: 112,
  observedRows: attendanceCells.length,
  missingAttributionRows: 2,
  lastRefreshedAt: '2026-08-19T14:25:00.000Z',
  source: 'clinical-attendance-heatmap',
  dateBasis: 'Queue arrival hour in Asia/Kuala_Lumpur',
  sourceFailed: false,
});

type Section = 'command' | 'finance' | 'performance' | 'planning';

function App() {
  return (
    <MemoryRouter>
      <InsightPage />
    </MemoryRouter>
  );
}

function InsightPage() {
  const [section, setSection] = useStateWithSearch<Section>('command');
  return (
    <InsightShell
      section={section}
      onSectionChange={setSection}
      range={range}
      onRangeChange={() => undefined}
      comparisonEnabled={false}
      onComparisonChange={() => undefined}
      onRefresh={() => undefined}
      exportItems={[]}
      confidence="current period"
    >
      {section === 'command' && (
        <div className="space-y-4">
          <InsightState state="partial" label="Some Command Centre data is incomplete." />
          <CommandCentreTab
            healthMetrics={healthMetrics}
            healthAlerts={[
              { id: 'missing-payment', severity: 'critical', title: 'Completed visits without payment', detail: '3 completed visits have no payment record.', count: 3, href: '/clinic/queue' },
              { id: 'out-of-stock', severity: 'warning', title: 'Items out of stock', detail: '2 items are out of stock.', count: 2, href: '/clinic/inventory' },
            ]}
            financialSummary={financialSummary}
            attendancePeriods={attendancePeriods}
            averageWaitingMinutes={averageWaiting}
            attendanceConfidence={attendanceConfidence}
            clinicLastRefreshedAt="2026-08-19T14:30:00.000Z"
            asOfDate={format(today, 'yyyy-MM-dd')}
            clinicSourceFailed={false}
            financialSourceFailed={false}
          />
        </div>
      )}
      {section === 'finance' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Finance</h1>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Visit billing, physical collections, panel claims, cost, and receivables in one ledger-safe workspace.</p>
          </div>
          <FinanceLedgerSummary summary={ledgerSummary} />
          <FinancialSummaryStrip
            period={financialSummary.period}
            comparison={financialSummary.comparison}
            comparisonLabel="21 Jul – 19 Aug"
            selectedMetric="billed_revenue"
            onMetricSelect={() => undefined}
          />
        </div>
      )}
      {section === 'performance' && (
        <div className="min-w-0 space-y-4">
          <InsightState state="partial" label="Partial data: some performance metrics have completeness limitations." />
          <ClinicPerformanceOverviewFixture />
          <DoctorPerformanceTable
            doctors={doctors}
            showFinancialColumns
            canOpenDoctor={() => true}
            onOpenDoctor={() => undefined}
          />
          <ServicePerformanceTable
            services={services}
            startDate={range.from}
            endDate={range.to}
            viewerScope={{ userId: 'preview', reportsView: { allowed: true, version: '1' } } as never}
            filters={{ doctorId: null, paymentType: 'all', activityType: 'all', includeComparison: false } as never}
            canSeeNamedDoctors
          />
        </div>
      )}
      {section === 'planning' && (
        <div className="space-y-4">
          <InsightState state="success" label="Planning data is reliable and up to date." />
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
      )}
    </InsightShell>
  );
}

function useStateWithSearch<T extends string>(initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const param = new URLSearchParams(window.location.search).get('section');
    return (param as T) ?? initial;
  });
  const set = (next: T) => {
    const params = new URLSearchParams(window.location.search);
    params.set('section', next);
    window.history.replaceState(null, '', `?${params.toString()}`);
    setValue(next);
  };
  return [value, set];
}

export default App;
