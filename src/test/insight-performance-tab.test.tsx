import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PerformanceTab } from '@/components/clinic/insight/performance/PerformanceTab';
import { InsightShell } from '@/components/clinic/insight/InsightShell';
import Insight from '@/pages/clinic/Insight';
import { getInsightAccess } from '@/lib/clinic/insight/insightAccess';
import type { InsightPerformanceReport } from '@/lib/clinic/insight/performance';
import { buildDoctorPerformanceCsv } from '@/lib/clinic/insight/performanceExports';

const test = vi.hoisted(() => ({
  useInsightPerformance: vi.fn(),
  useInsightPerformanceDetail: vi.fn(),
  doctorActivityRenders: vi.fn(),
}));

vi.mock('@/hooks/clinic/useInsightPerformance', () => ({
  useInsightPerformance: test.useInsightPerformance,
}));
vi.mock('@/hooks/clinic/useInsightPerformanceDetail', () => ({
  useInsightPerformanceDetail: test.useInsightPerformanceDetail,
}));

vi.mock('@/components/clinic/insight/DoctorClinicalActivity', () => ({
  DoctorClinicalActivity: (props: { doctorId?: string }) => {
    test.doctorActivityRenders(props);
    return <div>Charged procedure and document records</div>;
  },
}));
vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({ ClinicHealthTab: () => null }));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({ FinanceTab: () => null }));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({ PlanningTab: () => null }));
vi.mock('@/components/clinic/insight/ValuationTab', () => ({ ValuationTab: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

const report: InsightPerformanceReport = {
  clinic: {
    completedVisits: 24,
    uniquePatients: 20,
    rosteredHours: 15,
    patientsPerHour: 1.6,
    visitBilling: 3600,
    patientCollected: 2100,
    revenuePerHour: 240,
    cogs: 900,
    grossProfit: 2700,
    procedures: 8,
    documents: 5,
    selfPayVisits: 15,
    panelVisits: 9,
  },
  doctors: [
    {
      doctorId: 'doctor-b', doctorName: 'Dr B', completedVisits: 8, uniquePatients: 8,
      rosteredHours: 5, patientsPerHour: 1.6, visitBilling: 1200, revenuePerHour: 240,
      procedures: 3, documents: 2, missingAttribution: 0,
    },
    {
      doctorId: 'doctor-a', doctorName: 'Dr A', completedVisits: 16, uniquePatients: 12,
      rosteredHours: 10, patientsPerHour: 1.6, visitBilling: 2400, revenuePerHour: 240,
      procedures: 5, documents: 3, missingAttribution: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-low', serviceName: 'Nebuliser', volume: 5, uniquePatients: 4,
      revenue: 250, cogs: 50, profit: 200, marginPct: 80, averagePrice: 50,
      trendPct: null, doctorCount: 1, missingCostCount: 0,
    },
    {
      serviceId: 'service-high', serviceName: 'Wound dressing', volume: 6, uniquePatients: 5,
      revenue: 600, cogs: null, profit: null, marginPct: null, averagePrice: 100,
      trendPct: 20, doctorCount: 2, missingCostCount: 1,
    },
  ],
  quality: { missingAttribution: 1, missingCostCount: 1, excludedVoidedPayments: 2 },
  confidence: { state: 'partial', missingAttribution: 1, missingCostCount: 1 },
  generatedAt: '2026-08-17T06:30:00.000Z',
};

const queryResult = {
  data: report,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

function renderAdmin(props: Partial<React.ComponentProps<typeof PerformanceTab>> = {}) {
  return render(
    <PerformanceTab
      startDate={new Date('2026-08-01T00:00:00.000Z')}
      endDate={new Date('2026-08-31T00:00:00.000Z')}
      access={getInsightAccess('doctor_admin', null)}
      viewerRole="doctor_admin"
      viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
      enabled
      selectedDoctorId={null}
      onDoctorChange={vi.fn()}
      {...props}
    />,
  );
}

describe('PerformanceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    test.useInsightPerformance.mockReturnValue(queryResult);
    test.useInsightPerformanceDetail.mockImplementation((_start: string, _end: string, kind: string) => ({
      data: kind === 'doctor' ? {
        kind: 'doctor', doctorId: 'doctor-a', visitsByShift: [{ date: '2026-08-17', shift: 'S1', visits: 2 }],
        averageVisitDurationMinutes: 12, durationMeasuredVisits: 2, paymentMix: [{ paymentType: 'self_pay', visits: 2 }],
        financial: { revenue: 2400, cogs: 400, grossProfit: 2000, marginPct: 83.3, revenuePerVisit: 150, revenuePerHour: 240, missingCostCount: 0 },
        quality: { missingConsultationNotes: 0, missingDiagnosis: 0, missingDispenseNote: 0, returnedOfflineConsultations: 0, incompleteDoctorAttribution: 0, billsCorrectedAfterCompletion: 0 },
        diagnoses: [{ name: 'URTI', visits: 2 }], procedures: [{ name: 'Dressing', quantity: 2, charged: 100, cogs: 20, grossProfit: 80 }], medicines: [{ name: 'Paracetamol', quantity: 2 }],
      } : {
        kind: 'service', serviceId: 'service-high', serviceName: 'Wound dressing', trend: [{ date: '2026-08-17', volume: 2, revenue: 200 }], doctorContribution: [], paymentMix: [], visits: [], currentCatalog: null, marginHistory: [],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    }));
  });

  it('shows clinic totals, confidence limitations, and default result ordering', () => {
    renderAdmin();

    for (const value of ['24', '20', '15.0 h', '1.60', 'RM 3,600.00', 'RM 240.00']) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('status')).toHaveTextContent('Partial data');
    expect(screen.getByText(/1 record.*missing doctor attribution/i)).toBeInTheDocument();

    const doctorRows = screen.getAllByTestId('doctor-performance-row');
    expect(within(doctorRows[0]).getByText('Dr A')).toBeInTheDocument();
    expect(within(doctorRows[1]).getByText('Dr B')).toBeInTheDocument();

    const serviceRows = screen.getAllByTestId('service-performance-row');
    expect(within(serviceRows[0]).getByText('Wound dressing')).toBeInTheDocument();
    expect(within(serviceRows[0]).getByText('Missing cost')).toBeInTheDocument();
    expect(within(serviceRows[1]).getByText('Nebuliser')).toBeInTheDocument();
    expect(within(serviceRows[1]).getByText('Comparison unavailable')).toBeInTheDocument();
  });

  it('sends doctor, payer, activity, and comparison filters to the secured report hook', () => {
    renderAdmin({ comparisonEnabled: true });
    fireEvent.change(screen.getByLabelText('Filter performance by doctor'), { target: { value: 'doctor-a' } });
    fireEvent.change(screen.getByLabelText('Filter performance by payment'), { target: { value: 'panel' } });
    fireEvent.change(screen.getByLabelText('Filter performance by activity'), { target: { value: 'procedure' } });

    expect(test.useInsightPerformance).toHaveBeenLastCalledWith(
      '2026-08-01', '2026-08-31', expect.any(Object), { enabled: true },
      { doctorId: 'doctor-a', paymentType: 'panel', activityType: 'procedure', includeComparison: true },
    );
  });

  it('canonicalizes an invalid doctor deep link with replace semantics', () => {
    const onDoctorChange = vi.fn();
    renderAdmin({ selectedDoctorId: 'not-permitted', onDoctorChange });
    expect(onDoctorChange).toHaveBeenCalledWith(null, { replace: true });
  });

  it('renders loading, retryable error, empty, and reliable success states without false zeroes', () => {
    test.useInsightPerformance.mockReturnValue({ ...queryResult, data: undefined, isLoading: true });
    const view = renderAdmin();
    expect(screen.getByRole('status')).toHaveTextContent('Loading clinic performance');
    expect(screen.queryByRole('heading', { name: 'Clinic performance' })).not.toBeInTheDocument();

    const refetch = vi.fn();
    test.useInsightPerformance.mockReturnValue({
      ...queryResult, data: undefined, isError: true, error: new Error('RPC unavailable'), refetch,
    });
    view.rerender(
      <PerformanceTab
        startDate={new Date('2026-08-01T00:00:00.000Z')}
        endDate={new Date('2026-08-31T00:00:00.000Z')}
        access={getInsightAccess('doctor_admin', null)}
        viewerRole="doctor_admin"
        viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
        enabled selectedDoctorId={null} onDoctorChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('RPC unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry clinic performance' }));
    expect(refetch).toHaveBeenCalledTimes(1);

    test.useInsightPerformance.mockReturnValue({
      ...queryResult,
      data: {
        ...report,
        clinic: { ...report.clinic, completedVisits: 0, procedures: 0, documents: 0 },
        doctors: [], services: [],
      },
    });
    view.rerender(
      <PerformanceTab
        startDate={new Date('2026-08-01T00:00:00.000Z')}
        endDate={new Date('2026-08-31T00:00:00.000Z')}
        access={getInsightAccess('doctor_admin', null)} viewerRole="doctor_admin"
        viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
        enabled selectedDoctorId={null} onDoctorChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No completed clinical activity');

    test.useInsightPerformance.mockReturnValue({
      ...queryResult,
      data: {
        ...report,
        generatedAt: new Date().toISOString(),
        quality: { missingAttribution: 0, missingCostCount: 0, excludedVoidedPayments: 0 },
        confidence: { state: 'reliable', missingAttribution: 0, missingCostCount: 0 },
      },
    });
    view.rerender(
      <PerformanceTab
        startDate={new Date('2026-08-01T00:00:00.000Z')}
        endDate={new Date('2026-08-31T00:00:00.000Z')}
        access={getInsightAccess('doctor_admin', null)} viewerRole="doctor_admin"
        viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
        enabled selectedDoctorId={null} onDoctorChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('reliable and up to date');
  });

  it('loads charged clinical activity only after a doctor is opened', () => {
    const onDoctorChange = vi.fn();
    const view = renderAdmin({ onDoctorChange });

    expect(test.doctorActivityRenders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'View Dr A performance details' }));
    expect(onDoctorChange).toHaveBeenCalledWith('doctor-a');

    view.rerender(
      <PerformanceTab
        startDate={new Date('2026-08-01T00:00:00.000Z')}
        endDate={new Date('2026-08-31T00:00:00.000Z')}
        access={getInsightAccess('doctor_admin', null)}
        viewerRole="doctor_admin"
        viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
        enabled
        selectedDoctorId="doctor-a"
        onDoctorChange={onDoctorChange}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Dr A performance details' })).toBeInTheDocument();
    expect(test.doctorActivityRenders).not.toHaveBeenCalled();
    const clinicalTab = screen.getByRole('tab', { name: 'Clinical activity' });
    fireEvent.click(clinicalTab);
    expect(clinicalTab).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Charged procedure and document records')).toBeInTheDocument();
    expect(test.doctorActivityRenders).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'doctor-a' }));
  });

  it('opens a responsive service detail with trend and financial context', () => {
    renderAdmin();

    fireEvent.click(screen.getAllByRole('button', { name: 'View Wound dressing details' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Wound dressing service details' });
    expect(dialog).toHaveTextContent('20.0% increase');
    expect(dialog).toHaveTextContent('COGS unavailable');
    expect(dialog).toHaveTextContent('2 doctors');
    expect(dialog).toHaveTextContent('Daily trend');
    expect(dialog).toHaveTextContent('2026-08-17: 2 performed · RM 200.00');
  });

  it('registers role-safe doctor and service CSV actions in the shared export menu', async () => {
    const downloads: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:performance') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });

    render(
      <InsightShell
        section="performance"
        onSectionChange={vi.fn()}
        range={{ from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-31T00:00:00.000Z') }}
        onRangeChange={vi.fn()}
        comparisonEnabled
        onComparisonChange={vi.fn()}
        onRefresh={vi.fn()}
        exportItems={[]}
        confidence="partial"
      >
        <PerformanceTab
          startDate={new Date('2026-08-01T00:00:00.000Z')}
          endDate={new Date('2026-08-31T00:00:00.000Z')}
          access={getInsightAccess('doctor_admin', null)}
          viewerRole="doctor_admin"
          viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
          enabled
          selectedDoctorId={null}
          onDoctorChange={vi.fn()}
        />
      </InsightShell>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Doctor performance CSV' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Service performance CSV' }));

    expect(downloads).toEqual([
      'doctor-performance-2026-08-01-to-2026-08-31.csv',
      'service-performance-2026-08-01-to-2026-08-31.csv',
    ]);
  });

  it('marks old generated data stale while keeping the last report visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T08:00:00.000Z'));
    test.useInsightPerformance.mockReturnValue({
      ...queryResult,
      data: {
        ...report,
        generatedAt: '2026-08-17T06:30:00.000Z',
        quality: { missingAttribution: 0, missingCostCount: 0, excludedVoidedPayments: 0 },
        confidence: { state: 'reliable', missingAttribution: 0, missingCostCount: 0 },
      },
    });

    renderAdmin();

    expect(screen.getByRole('status')).toHaveTextContent('Stale data');
    expect(screen.getByRole('heading', { name: 'Clinic performance' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('restores and updates permitted doctor detail through the performance URL', () => {
    window.history.replaceState({}, '', '/clinic/insight?section=performance&doctor=doctor-a');
    const view = render(
      <Insight
        initialSearch="?section=performance&doctor=doctor-a"
        access={getInsightAccess('doctor_admin', null)}
        viewerRole="doctor_admin"
        viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Dr A performance details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(window.location.search).toBe('?section=performance');

    view.unmount();
  });

  it('exports audit metadata and neutralizes spreadsheet formulas in names', () => {
    const lines = buildDoctorPerformanceCsv({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      report,
    }, [{ ...report.doctors[0], doctorName: '=HYPERLINK("https://example.test")' }]);

    expect(lines[0]).toContain('metric_definition_version');
    expect(lines[0]).toContain('missing_attribution_count');
    expect(lines[1]).toContain('insight-performance-v1');
    expect(lines[1]).toContain("'=HYPERLINK");
  });
});
