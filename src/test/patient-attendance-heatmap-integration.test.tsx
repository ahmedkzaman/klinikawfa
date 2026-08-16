import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAttendanceHeatmap = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({
  attendancePresetRange: vi.fn(() => ({ startDate: '2026-08-03', endDate: '2026-10-25' })),
  useAttendanceHeatmap,
}));

import { PatientAttendanceHeatmap } from '@/components/clinic/dashboard/PatientAttendanceHeatmap';
import { assessDoctorOffDays, type AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';
import { fitAttendanceRegression, type AttendanceRegressionObservation } from '@/lib/clinic/attendanceRegression';

function dateFor(week: number, weekday: number): string {
  return new Date(Date.UTC(2026, 7, 3 + (week * 7) + (weekday - 1))).toISOString().slice(0, 10);
}

function sqlShapedObservations(selectedDoctor: boolean): AttendanceRegressionObservation[] {
  return Array.from({ length: 12 }, (_, week) => [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [8, 9].map(hour => {
    const backupDoctorCovered = selectedDoctor && ((week * 2) + weekday + hour) % 4 !== 0;
    return {
      date: dateFor(week, weekday),
      weekday: weekday as AttendanceRegressionObservation['weekday'],
      hour,
      visits: weekday === 1 ? hour === 9 && week % 3 === 0 ? 14 : 0 : weekday === 6 ? 4 : 3,
      averageWaitMinutes: 15,
      waitMeasuredVisits: 1,
      doctorsRostered: selectedDoctor
        ? 1 + Number(backupDoctorCovered)
        : 1 + ((week + weekday + hour) % 2),
      selectedDoctorScheduled: selectedDoctor,
      backupDoctorCovered,
    };
  }))).flat();
}

function cells(): AttendanceHeatmapCell[] {
  return [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [8, 9].map(hour => ({
    weekday: weekday as AttendanceHeatmapCell['weekday'],
    hour,
    totalVisits: 24,
    rawTotalVisits: 24,
    operatingOccurrences: 12,
    averageVisits: 2,
    medianVisits: 2,
    peakVisits: 4,
    averageWaitMinutes: 15,
    waitMeasuredVisits: 12,
    comparisonAverageVisits: null,
    comparisonAbsoluteChange: null,
    comparisonPercentChange: null,
    otherDoctorCoveredOccurrences: 0,
    dates: Array.from({ length: 12 }, (_, week) => ({
      date: dateFor(week, weekday),
      visits: 2,
      averageWaitMinutes: 15,
    })),
    coverage: 'complete' as const,
  })));
}

const allDoctorObservations = sqlShapedObservations(false);
const selectedDoctorObservations = sqlShapedObservations(true);
const report = (observations: AttendanceRegressionObservation[]) => ({
  period: {
    startDate: '2026-08-03',
    endDate: '2026-10-25',
    comparisonStartDate: '2026-05-11',
    comparisonEndDate: '2026-08-02',
    timezone: 'Asia/Kuala_Lumpur' as const,
  },
  doctors: [{ id: 'doctor-1', name: 'Dr Aina' }],
  warnings: [],
  observations,
  cells: cells(),
  hasAttendanceData: true,
});

describe('PatientAttendanceHeatmap model integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAttendanceHeatmap.mockImplementation(({ doctorId }: { doctorId: string | null }) => ({
      data: report(doctorId ? selectedDoctorObservations : allDoctorObservations),
      isLoading: false,
      isError: false,
      error: null,
    }));
  });

  it('renders real assessment results for all doctors and a SQL-shaped selected-doctor fit', () => {
    const allDoctorsFit = fitAttendanceRegression(allDoctorObservations, null);
    const selectedDoctorFit = fitAttendanceRegression(selectedDoctorObservations, 'doctor-1');
    expect(allDoctorsFit.status).toBe('ready');
    expect(selectedDoctorFit.status).toBe('ready');
    if (allDoctorsFit.status !== 'ready' || selectedDoctorFit.status !== 'ready') return;

    const allDoctorAssessments = assessDoctorOffDays(cells(), allDoctorsFit, null);
    const selectedDoctorAssessments = assessDoctorOffDays(cells(), selectedDoctorFit, 'doctor-1');
    expect(allDoctorAssessments.some(item => item.reasons.includes('Hourly upper prediction crosses the busy threshold.'))).toBe(true);
    expect(allDoctorAssessments.every(item => !item.reasons.includes('Backup doctor coverage is incomplete.'))).toBe(true);
    expect(selectedDoctorAssessments.some(item => item.reasons.includes('Backup doctor coverage is incomplete.'))).toBe(true);

    render(<PatientAttendanceHeatmap />);
    expect(screen.getAllByText('No safe period identified').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('View detailed analysis'));
    fireEvent.click(screen.getByText('View all checks by weekday'));
    expect(screen.getAllByText('Hourly upper prediction crosses the busy threshold.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Backup doctor coverage is incomplete.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/treating doctor/i), { target: { value: 'doctor-1' } });
    expect(screen.getAllByText('Backup doctor coverage is incomplete.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Regression model did not converge/i)).not.toBeInTheDocument();
  });
});
