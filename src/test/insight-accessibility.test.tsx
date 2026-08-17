import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InsightState } from '@/components/clinic/insight/shared/InsightState';
import { CollectionDetailSheet } from '@/components/clinic/insight/finance/CollectionDetailSheet';
import { DoctorPerformanceDetail } from '@/components/clinic/insight/performance/DoctorPerformanceDetail';
import { ServicePerformanceTable } from '@/components/clinic/insight/performance/ServicePerformanceTable';
import { OperationalCalendar } from '@/components/clinic/insight/planning/OperationalCalendar';
import { PlanningAttendanceSummary } from '@/components/clinic/insight/planning/PlanningAttendanceSummary';
import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';

vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({
  PrintReceiptDialog: () => null,
}));
vi.mock('@/components/clinic/insight/DoctorClinicalActivity', () => ({
  DoctorClinicalActivity: () => null,
}));
vi.mock('@/hooks/clinic/useInsightPerformanceDetail', () => ({
  useInsightPerformanceDetail: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('Clinic Insight accessibility hardening', () => {
  it('announces refresh/error states and exposes retry controls with explicit accessible names', () => {
    const retry = vi.fn();
    render(<InsightState state="error" label="Planning attendance" error={new Error('RPC unavailable')} onRetry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('RPC unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Planning attendance' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the collection card that opened a detail sheet', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Cash';
    document.body.appendChild(trigger);
    trigger.focus();

    const rows = [{
      paymentId: 'cash-1',
      createdAt: '2026-08-01T01:01:00Z',
      queueEntryId: 'q1',
      consultationId: 'c1',
      paymentType: 'self_pay' as const,
      paymentMethod: 'cash',
      amount: 40,
    }];
    const view = render(<CollectionDetailSheet collection="cash" rows={rows} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Cash collections' })).toBeInTheDocument();

    view.rerender(<CollectionDetailSheet collection={null} rows={rows} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('formats operational period ids as readable time ranges in text alternatives', () => {
    render(
      <OperationalCalendar
        decisions={{
          training: { status: 'ready', title: 'Training', weekday: 1, periodId: '12_16', reason: 'Lowest safe demand.', expectedVisits: 4, lowerPrediction: 2, upperPrediction: 6, confidence: 'high' },
          offDay: { status: 'unavailable', title: 'Off day', weekday: null, periodId: null, reason: 'No candidate.', expectedVisits: null, lowerPrediction: null, upperPrediction: null, confidence: 'insufficient' },
          peak: { status: 'ready', title: 'Peak cover', weekday: 5, periodId: '20_24', reason: 'Highest demand.', expectedVisits: 9, lowerPrediction: 7, upperPrediction: 12, confidence: 'high' },
        }}
        regression={{ status: 'ready', diagnostics: { usableWeeks: 12 }, weekdays: [] } as never}
      />,
    );

    expect(screen.getByText(/Training: Monday, 12:00-16:00/)).toBeInTheDocument();
    expect(screen.getByText(/Peak cover: Friday, 20:00-00:00/)).toBeInTheDocument();
    expect(screen.queryByText(/12_16/)).not.toBeInTheDocument();
  });

  it('returns focus to the service detail trigger after closing the sheet', async () => {
    render(
      <ServicePerformanceTable
        services={[{
          serviceId: 'svc-ear',
          serviceName: 'Ear microsuction',
          volume: 4,
          uniquePatients: 4,
          revenue: 320,
          cogs: 40,
          profit: 280,
          marginPct: 87.5,
          averagePrice: 80,
          trendPct: 12,
          doctorCount: 2,
          missingCostCount: 0,
        }]}
        startDate={new Date('2026-08-01')}
        endDate={new Date('2026-08-31')}
        viewerScope={{ userId: 'u1', reportsView: { allowed: true, version: 'v1' } }}
        filters={{ doctorIds: [], paymentTypes: [] }}
        canSeeNamedDoctors
      />,
    );

    const trigger = screen.getByRole('button', { name: 'View Ear microsuction details' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Ear microsuction service details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('returns focus to the doctor performance trigger after closing the sheet', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Dr Ahmed';
    document.body.appendChild(trigger);
    trigger.focus();

    const doctor = {
      doctorId: 'doctor-1',
      doctorName: 'Dr Ahmed',
      completedVisits: 12,
      uniquePatients: 10,
      rosteredHours: 8,
      patientsPerHour: 1.5,
      visitBilling: 900,
      revenuePerHour: 112.5,
      procedures: 2,
      documents: 3,
      missingAttribution: 0,
    };
    const report = {
      clinic: {
        completedVisits: 12,
        uniquePatients: 10,
        rosteredHours: 8,
        patientsPerHour: 1.5,
        visitBilling: 900,
        patientCollected: 600,
        revenuePerHour: 112.5,
        cogs: 90,
        grossProfit: 810,
        procedures: 2,
        documents: 3,
        selfPayVisits: 8,
        panelVisits: 4,
      },
      doctors: [doctor],
      services: [],
      quality: { missingAttribution: 0, missingCostCount: 0, excludedVoidedPayments: 0 },
      confidence: { state: 'reliable' as const, missingAttribution: 0, missingCostCount: 0 },
      generatedAt: '2026-08-16T00:00:00Z',
    };
    const view = render(
      <DoctorPerformanceDetail
        doctor={doctor}
        report={report}
        startDate={new Date('2026-08-01')}
        endDate={new Date('2026-08-31')}
        canLoadClinicalActivity
        viewerScope={{ userId: 'u1', reportsView: { allowed: true, version: 'v1' } }}
        filters={{ doctorIds: [], paymentTypes: [] }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Dr Ahmed performance details' })).toBeInTheDocument();

    view.rerender(
      <DoctorPerformanceDetail
        doctor={null}
        report={report}
        startDate={new Date('2026-08-01')}
        endDate={new Date('2026-08-31')}
        canLoadClinicalActivity
        viewerScope={{ userId: 'u1', reportsView: { allowed: true, version: 'v1' } }}
        filters={{ doctorIds: [], paymentTypes: [] }}
        onClose={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('shows a readable hourly text summary beside the advanced attendance heatmap', () => {
    const cells: AttendanceHeatmapCell[] = [{
      weekday: 1,
      hour: 8,
      averageVisits: 3,
      medianVisits: 3,
      peakVisits: 5,
      averageWaitMinutes: 18,
      operatingOccurrences: 4,
      coverage: 'sufficient',
      confidence: 'reliable',
    }];
    const period = {
      weekday: 1,
      periodId: '8_12',
      label: 'Monday 08:00-12:00',
      startHour: 8,
      endHour: 12,
      expectedVisits: 3,
      lowerPrediction: 2,
      upperPrediction: 5,
      confidence: 'reliable',
      safetyReasons: [],
      hourly: [{ label: '08:00-09:00', cell: cells[0] }],
    };

    render(
      <PlanningAttendanceSummary
        analysis={{
          periods: [period],
          decisions: {
            training: { status: 'ready', title: 'Training', weekday: 1, periodId: '8_12', reason: 'Lowest safe demand.', expectedVisits: 3, lowerPrediction: 2, upperPrediction: 5, confidence: 'reliable' },
            offDay: { status: 'unavailable', title: 'Off day', weekday: null, periodId: null, reason: 'No candidate.', expectedVisits: null, lowerPrediction: null, upperPrediction: null, confidence: 'insufficient' },
            peak: { status: 'ready', title: 'Peak cover', weekday: 1, periodId: '8_12', reason: 'Highest demand.', expectedVisits: 3, lowerPrediction: 2, upperPrediction: 5, confidence: 'reliable' },
          },
        }}
        regression={{ status: 'ready', diagnostics: { usableWeeks: 12 }, weekdays: [] } as never}
        cells={cells}
        offDayAssessments={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Advanced detail' }));
    expect(screen.getByRole('list', { name: 'Hourly attendance summary' })).toHaveTextContent(
      'Monday 08:00-09:00: average 3.0 visits, peak 5.0, 18.0 min wait, sufficient coverage.',
    );
  });
});
