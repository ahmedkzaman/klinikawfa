import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PerformanceTab } from '@/components/clinic/insight/performance/PerformanceTab';
import { getInsightAccess } from '@/lib/clinic/insight/insightAccess';
import type { InsightPerformanceReport } from '@/lib/clinic/insight/performance';

const useInsightPerformanceMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/clinic/useInsightPerformance', () => ({ useInsightPerformance: useInsightPerformanceMock }));
vi.mock('@/hooks/clinic/useInsightPerformanceDetail', () => ({ useInsightPerformanceDetail: vi.fn() }));
vi.mock('@/components/clinic/insight/DoctorClinicalActivity', () => ({ DoctorClinicalActivity: () => null }));

const baseReport: InsightPerformanceReport = {
  clinic: {
    completedVisits: 3, uniquePatients: 3, rosteredHours: 5, patientsPerHour: 0.6,
    visitBilling: 300, patientCollected: 200, revenuePerHour: 60, cogs: 50,
    grossProfit: 250, procedures: 2, documents: 1, selfPayVisits: 2, panelVisits: 1,
  },
  doctors: [],
  services: [{
    serviceId: 'service-a', serviceName: 'Dressing', volume: 2, uniquePatients: 2,
    revenue: 200, cogs: 20, profit: 180, marginPct: 90, averagePrice: 100,
    trendPct: 5, doctorCount: 1, missingCostCount: 0,
  }],
  quality: { missingAttribution: 0, missingCostCount: 0, excludedVoidedPayments: 0 },
  confidence: { state: 'reliable', missingAttribution: 0, missingCostCount: 0 },
  generatedAt: '2026-08-17T06:30:00.000Z',
};

function renderFor(
  role: Parameters<typeof getInsightAccess>[0],
  report: InsightPerformanceReport,
  ownDoctorId: string | null = null,
) {
  useInsightPerformanceMock.mockReturnValue({
    data: report, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
  });
  return render(
    <PerformanceTab
      startDate={new Date('2026-08-01T00:00:00.000Z')}
      endDate={new Date('2026-08-31T00:00:00.000Z')}
      access={getInsightAccess(role, ownDoctorId)}
      viewerRole={role}
      viewerScope={{ userId: `${role}-user`, reportsView: { allowed: true, version: 'v1' } }}
      enabled
      selectedDoctorId={null}
      onDoctorChange={vi.fn()}
    />,
  );
}

describe('Performance role presentation policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows named doctor financial comparisons to doctor admins', () => {
    renderFor('doctor_admin', {
      ...baseReport,
      doctors: [{
        doctorId: 'doctor-a', doctorName: 'Dr Admin Visible', completedVisits: 3,
        uniquePatients: 3, rosteredHours: 5, patientsPerHour: 0.6, visitBilling: 300,
        revenuePerHour: 60, procedures: 2, documents: 1, missingAttribution: 0,
      }],
    });

    expect(screen.getByText('Dr Admin Visible')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Visit billing' })).toBeInTheDocument();
  });

  it('keeps only the resident own row and anonymized benchmark and suppresses services', () => {
    renderFor('resident_doctor', {
      ...baseReport,
      doctors: [
        {
          doctorId: 'doctor-own', doctorName: 'Dr Resident', completedVisits: 2,
          uniquePatients: 2, rosteredHours: 5, patientsPerHour: 0.4, visitBilling: 180,
          revenuePerHour: 36, procedures: 1, documents: 1, missingAttribution: 0,
        },
        {
          doctorId: 'doctor-other', doctorName: 'Dr Must Be Redacted', completedVisits: 99,
          uniquePatients: 99, rosteredHours: 1, patientsPerHour: 99, visitBilling: 99999,
          revenuePerHour: 99999, procedures: 99, documents: 99, missingAttribution: 0,
        },
        {
          doctorId: null, doctorName: 'Clinic benchmark', completedVisits: 3,
          uniquePatients: 3, rosteredHours: 5, patientsPerHour: 0.6, visitBilling: 300,
          revenuePerHour: 60, procedures: 2, documents: 1, missingAttribution: 0,
        },
      ],
      services: [],
    }, 'doctor-own');

    expect(screen.getByText('Dr Resident')).toBeInTheDocument();
    expect(screen.getByText('Clinic benchmark')).toBeInTheDocument();
    expect(screen.queryByText('Dr Must Be Redacted')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Service performance' })).not.toBeInTheDocument();
  });

  it('never infers resident identity from the first named row', () => {
    renderFor('resident_doctor', {
      ...baseReport,
      doctors: [{
        doctorId: 'attacker-controlled-first-row', doctorName: 'Must stay redacted', completedVisits: 3,
        uniquePatients: 3, rosteredHours: 5, patientsPerHour: 0.6, visitBilling: 300,
        revenuePerHour: 60, procedures: 2, documents: 1, missingAttribution: 0,
      }, {
        doctorId: null, doctorName: 'Clinic benchmark', completedVisits: 3,
        uniquePatients: 3, rosteredHours: 5, patientsPerHour: 0.6, visitBilling: 300,
        revenuePerHour: 60, procedures: 2, documents: 1, missingAttribution: 0,
      }],
      services: [],
    }, null);
    expect(screen.queryByText('Must stay redacted')).not.toBeInTheDocument();
    expect(screen.getByText('Clinic benchmark')).toBeInTheDocument();
  });

  it('shows clinic and service performance to operations without doctor comparison', () => {
    renderFor('operations', { ...baseReport, doctors: [] });

    expect(screen.getByRole('heading', { name: 'Clinic performance' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Doctor performance' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Service performance' })).toBeInTheDocument();
  });

  it('denies locums before the performance data hook can execute', () => {
    renderFor('locum', baseReport);

    expect(screen.getByRole('alert')).toHaveTextContent('Performance access restricted');
    expect(useInsightPerformanceMock).not.toHaveBeenCalled();
  });
});
