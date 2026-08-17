import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAttendanceHeatmap = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({ useAttendanceHeatmap }));

import { PlanningTab } from '@/components/clinic/insight/planning/PlanningTab';
import { averageShiftExpectedVisits } from '@/components/clinic/insight/planning/coverageMath';
import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';
import type { AttendanceRegressionObservation } from '@/lib/clinic/attendanceRegression';

function dateFor(week: number, weekday: number): string {
  return new Date(Date.UTC(2026, 7, 3 + (week * 7) + (weekday - 1))).toISOString().slice(0, 10);
}

function observations(): AttendanceRegressionObservation[] {
  return Array.from({ length: 12 }, (_, week) => [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => Array.from({ length: 16 }, (_, offset) => {
    const hour = offset + 8;
    return {
      date: dateFor(week, weekday), weekday: weekday as AttendanceRegressionObservation['weekday'], hour,
      visits: 2 + (week % 3) + (hour % 4) + (weekday === 6 ? 2 : 0),
      averageWaitMinutes: 14, waitMeasuredVisits: 1,
      doctorsRostered: hour >= 20 ? 2 : 1,
      selectedDoctorScheduled: false, backupDoctorCovered: true,
    };
  }))).flat();
}

function cells(): AttendanceHeatmapCell[] {
  return [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => Array.from({ length: 16 }, (_, offset) => ({
    weekday: weekday as AttendanceHeatmapCell['weekday'], hour: offset + 8,
    totalVisits: 36, rawTotalVisits: 36, operatingOccurrences: 12,
    averageVisits: 3, medianVisits: 3, peakVisits: 6, averageWaitMinutes: 14,
    waitMeasuredVisits: 12, comparisonAverageVisits: 2, comparisonAbsoluteChange: 1,
    comparisonPercentChange: 50, otherDoctorCoveredOccurrences: 12,
    dates: Array.from({ length: 12 }, (_, week) => ({ date: dateFor(week, weekday), visits: 3, averageWaitMinutes: 14 })),
    coverage: 'complete' as const,
  })));
}

const report = {
  period: { startDate: '2026-08-03', endDate: '2026-10-25', comparisonStartDate: '2026-05-11', comparisonEndDate: '2026-08-02', timezone: 'Asia/Kuala_Lumpur' as const },
  doctors: [{ id: 'doctor-1', name: 'Dr Aina' }, { id: 'doctor-2', name: 'Dr Kumar' }],
  warnings: [], observations: observations(), cells: cells(), hasAttendanceData: true,
};

describe('PlanningTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAttendanceHeatmap.mockReturnValue({ data: report, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  });

  it('composes the secured regression-led planning workspace', () => {
    render(<PlanningTab startDate={new Date('2026-08-03T00:00:00Z')} endDate={new Date('2026-10-25T00:00:00Z')} enabled />);

    expect(useAttendanceHeatmap).toHaveBeenCalledWith(expect.objectContaining({ permissionDomain: 'insight', doctorId: null }));
    expect(screen.getAllByRole('button', { name: /08:00.*12:00/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /12:00.*16:00/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /16:00.*20:00/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /20:00.*00:00/ }).length).toBeGreaterThan(0);

    const recommendation = screen.getByRole('region', { name: /regression recommendation/i });
    expect(recommendation).toHaveTextContent(/Regression status/i);
    expect(recommendation).toHaveTextContent(/Predicted attendance/i);
    expect(recommendation).toHaveTextContent(/Uncertainty/i);
    expect(recommendation).toHaveTextContent(/Veto reason/i);
    expect(recommendation).toHaveTextContent(/Observed context/i);
    expect(recommendation).toHaveTextContent(/Model\/data confidence/i);
    expect(screen.getByRole('link', { name: /management dashboard/i })).toHaveAttribute('href', '/clinic/dashboard');
    expect(screen.getByRole('link', { name: /roster editor/i })).toHaveAttribute('href', '/staff/dr-roster');
    fireEvent.click(screen.getByRole('button', { name: /Monday 12:00.*16:00/ }));
    expect(screen.getByRole('dialog', { name: /attendance details/i })).toBeVisible();
  });

  it('uses average daily regression demand for a shift, rather than a seven-day total', () => {
    expect(averageShiftExpectedVisits([
      { weekday: 1, hour: 8, expectedVisits: 2 }, { weekday: 1, hour: 9, expectedVisits: 3 },
      { weekday: 2, hour: 8, expectedVisits: 4 }, { weekday: 2, hour: 9, expectedVisits: 5 },
    ])).toBe(7);
  });
});
