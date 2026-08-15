import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAttendanceHeatmap = vi.hoisted(() => vi.fn());
const attendanceModel = vi.hoisted(() => ({
  fitAttendanceRegression: vi.fn(),
  assessDoctorOffDays: vi.fn(),
}));

vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({
  attendancePresetRange: vi.fn(({ preset }: { preset: string }) => preset === 'custom'
    ? { startDate: '2026-08-10', endDate: '2026-08-15' }
    : { startDate: '2026-05-25', endDate: '2026-08-16' }),
  useAttendanceHeatmap,
}));

vi.mock('@/lib/clinic/attendanceRegression', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/clinic/attendanceRegression')>(),
  fitAttendanceRegression: attendanceModel.fitAttendanceRegression,
}));

vi.mock('@/lib/clinic/attendanceHeatmap', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/clinic/attendanceHeatmap')>(),
  assessDoctorOffDays: attendanceModel.assessDoctorOffDays,
}));

import { PatientAttendanceHeatmap } from '@/components/clinic/dashboard/PatientAttendanceHeatmap';

const report = {
  period: {
    startDate: '2026-05-25', endDate: '2026-08-16',
    comparisonStartDate: '2026-03-02', comparisonEndDate: '2026-05-24', timezone: 'Asia/Kuala_Lumpur' as const,
  },
  doctors: [{ id: 'doctor-1', name: 'Dr Aina' }],
  warnings: ['Roster coverage is incomplete for some periods.'],
  observations: [],
  cells: [
    {
      weekday: 1 as const, hour: 8, totalVisits: 16, rawTotalVisits: 17, operatingOccurrences: 8,
      averageVisits: 2, medianVisits: 2, peakVisits: 4, averageWaitMinutes: 50,
      waitMeasuredVisits: 6, comparisonAverageVisits: 1, comparisonAbsoluteChange: 1,
      comparisonPercentChange: 100, otherDoctorCoveredOccurrences: 0,
      dates: [{ date: '2026-06-01', visits: 3, averageWaitMinutes: 45 }], coverage: 'complete' as const,
    },
    {
      weekday: 1 as const, hour: 9, totalVisits: 0, rawTotalVisits: 0, operatingOccurrences: 0,
      averageVisits: null, medianVisits: null, peakVisits: null, averageWaitMinutes: null,
      waitMeasuredVisits: 0, comparisonAverageVisits: null, comparisonAbsoluteChange: null,
      comparisonPercentChange: null, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'uncovered' as const,
    },
    {
      weekday: 1 as const, hour: 10, totalVisits: 8, rawTotalVisits: 8, operatingOccurrences: 4,
      averageVisits: 2, medianVisits: 2, peakVisits: 2, averageWaitMinutes: 10,
      waitMeasuredVisits: 4, comparisonAverageVisits: 1, comparisonAbsoluteChange: 1,
      comparisonPercentChange: 100, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'insufficient' as const,
    },
    {
      weekday: 2 as const, hour: 8, totalVisits: 0, rawTotalVisits: 0, operatingOccurrences: 8,
      averageVisits: 0, medianVisits: 0, peakVisits: 0, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: -1,
      comparisonPercentChange: -100, otherDoctorCoveredOccurrences: 8, dates: [], coverage: 'complete' as const,
    },
    {
      weekday: 2 as const, hour: 9, totalVisits: 8, rawTotalVisits: 8, operatingOccurrences: 8,
      averageVisits: 1, medianVisits: 1, peakVisits: 1, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: 0,
      comparisonPercentChange: 0, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'complete' as const,
    },
    {
      weekday: 2 as const, hour: 10, totalVisits: 8, rawTotalVisits: 8, operatingOccurrences: 8,
      averageVisits: 1, medianVisits: 1, peakVisits: 1, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: 0,
      comparisonPercentChange: 0, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'complete' as const,
    },
  ],
};

const readyRegression = {
  status: 'ready' as const,
  diagnostics: {
    family: 'negative_binomial' as const, converged: true, iterations: 4,
    usableWeeks: 12, observationCount: 96, dispersion: 0.4, warnings: [],
  },
  hourly: [],
  weekdays: [],
};

const suggestedAssessment = {
  status: 'suggested' as const,
  weekday: 2 as const,
  safetyScore: 0.14,
  reasons: [],
  passedChecks: [
    'At least 8 comparable dates.',
    'Daily upper prediction is below the busy-day threshold.',
    'Backup doctor coverage is complete.',
  ],
  forecast: {
    weekday: 2 as const, expectedTotal: 3.24, lowerPrediction: 1.1, upperPrediction: 5.38,
    highestExpectedHour: { weekday: 2 as const, hour: 9, expectedVisits: 1.56, lowerPrediction: 0.2, upperPrediction: 2.92 },
    highestObservedPeak: 4, averageWaitMinutes: 12.4, comparableDates: 12, backupCoverageRate: 1,
  },
};

function unavailableRegression(reason: string, usableWeeks = 12) {
  return {
    status: 'unavailable' as const,
    diagnostics: {
      family: 'negative_binomial' as const, converged: false, iterations: 50,
      usableWeeks, observationCount: 96, dispersion: Number.NaN, warnings: [reason],
    },
    reasons: [reason],
  };
}

function unavailableAssessmentFromModel(regression: { status: string; reasons?: string[] }) {
  return [{
    status: 'unavailable' as const, weekday: null, forecast: null, safetyScore: null,
    reasons: regression.status === 'unavailable' ? regression.reasons ?? [] : [], passedChecks: [],
  }];
}

describe('PatientAttendanceHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAttendanceHeatmap.mockReturnValue({ data: report, isLoading: false, isError: false, error: null });
    attendanceModel.fitAttendanceRegression.mockReturnValue(readyRegression);
    attendanceModel.assessDoctorOffDays.mockReturnValue([suggestedAssessment]);
  });

  it('renders an accessible Monday–Sunday, 08:00–00:00 heatmap with colour-independent statuses', () => {
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByRole('heading', { name: /patient attendance heatmap/i })).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('08:00–09:00')).toBeInTheDocument();
    expect(screen.getByText('23:00–00:00')).toBeInTheDocument();
    expect(screen.getAllByText(/Closed \/ not operating/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uncovered roster gap/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Insufficient data/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Covered average/i).length).toBeGreaterThan(0);
    const alertCell = screen.getByRole('button', { name: /Monday 08:00–09:00.*2.*wait alert/i });
    expect(alertCell).toHaveClass('ring-red-600');
    expect(alertCell.className).toMatch(/bg-blue-/);
  });

  it('lets users filter by period and treating doctor', () => {
    render(<PatientAttendanceHeatmap />);

    fireEvent.change(screen.getByLabelText(/attendance period/i), { target: { value: 'month' } });
    expect(useAttendanceHeatmap.mock.calls.at(-1)?.[0]).toMatchObject({ doctorId: null });
    fireEvent.change(screen.getByLabelText(/treating doctor/i), { target: { value: 'doctor-1' } });
    expect(useAttendanceHeatmap.mock.calls.at(-1)?.[0]).toMatchObject({ doctorId: 'doctor-1' });
    expect(screen.getByText(/selected treating doctor/i)).toBeInTheDocument();
  });

  it('opens a focused details dialog with aggregate evidence and no patient identifiers', () => {
    render(<PatientAttendanceHeatmap />);

    const cell = screen.getByRole('button', { name: /Monday 08:00–09:00.*2.*wait alert/i });
    fireEvent.click(cell);
    const dialog = screen.getByRole('dialog', { name: /attendance cell details/i });
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus();
    expect(dialog).toHaveTextContent(/Visits on operating dates:\s*16/i);
    expect(dialog).toHaveTextContent(/Raw visits including uncovered dates:\s*17/i);
    expect(dialog).toHaveTextContent(/Average:\s*2/i);
    expect(dialog).toHaveTextContent(/Median:\s*2/i);
    expect(dialog).toHaveTextContent(/Peak:\s*4/i);
    expect(dialog).toHaveTextContent(/Operating-date sample:\s*8/i);
    expect(dialog).toHaveTextContent(/Average wait:\s*50/i);
    expect(dialog).toHaveTextContent(/Measured waits:\s*6/i);
    expect(dialog).toHaveTextContent(/Comparison:\s*\+1.*100%/i);
    expect(dialog).toHaveTextContent(/2026-06-01:\s*3/i);
    expect(dialog).not.toHaveTextContent(/patient|name|ic number/i);
  });

  it('renders deterministic recommendations with their evidence and suggestion label', () => {
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByRole('heading', { name: /recommendations/i })).toBeInTheDocument();
    expect(screen.getByText(/Training window/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Peak staffing/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Possible doctor off-day.*suggestion only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
  });

  it('shows a suggested off-day with predicted and observed safety evidence', () => {
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByText('Possible doctor off-day — suggestion only')).toBeInTheDocument();
    expect(screen.getByText(/Predicted visits:\s*3\.2/i)).toBeInTheDocument();
    expect(screen.getByText(/Prediction range:\s*1\.1–5\.4/i)).toBeInTheDocument();
    expect(screen.getByText(/Highest-risk hour:\s*09:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Observed peak:\s*4\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Backup coverage:\s*100\.0%/i)).toBeInTheDocument();
    expect(screen.getByText(/Planning aid only — confirm against roster and current operations\./i)).toBeInTheDocument();
  });

  it('labels only the lowest-score safe candidate as ranked safest', () => {
    attendanceModel.assessDoctorOffDays.mockReturnValue([
      { ...suggestedAssessment, weekday: 1, safetyScore: 0.7, forecast: { ...suggestedAssessment.forecast, weekday: 1, expectedTotal: 7.8 } },
      { ...suggestedAssessment, weekday: 2, safetyScore: 0.1, forecast: { ...suggestedAssessment.forecast, weekday: 2, expectedTotal: 3.2 } },
    ]);
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByText(/Ranked safest: safety score 0\.1/i)).toBeInTheDocument();
    expect(screen.getByText(/Predicted visits:\s*3\.2/i)).toBeInTheDocument();
    expect(screen.queryByText(/Predicted visits:\s*7\.8/i)).not.toBeInTheDocument();
  });

  it('shows the highest-priority safety reasons when no weekday is safe', () => {
    attendanceModel.assessDoctorOffDays.mockReturnValue([{
      ...suggestedAssessment,
      status: 'rejected', safetyScore: null,
      reasons: ['Average wait exceeds 45 minutes.', 'Backup doctor coverage is incomplete.', 'Prediction volatility is too high.', 'This lower-priority reason is hidden initially.'],
      passedChecks: [],
    }]);
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByText('No safe off-day recommendation')).toBeInTheDocument();
    const priorityReasons = within(screen.getByLabelText(/highest-priority safety reasons/i));
    expect(priorityReasons.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Backup doctor coverage is incomplete.',
      'Average wait exceeds 45 minutes.',
      'Prediction volatility is too high.',
    ]);
    expect(screen.getByLabelText(/safety checks/i)).toBeInTheDocument();
    expect(screen.getByText('View all checks')).toBeInTheDocument();
  });

  it.each([
    ['fewer than 12 weeks', unavailableRegression('Not enough data for regression recommendation', 11)],
    ['a non-convergent model', unavailableRegression('Regression model did not converge')],
  ])('keeps the descriptive heatmap available when regression returns unavailable for %s', (_scenario, regression) => {
    attendanceModel.fitAttendanceRegression.mockReturnValue(regression);
    attendanceModel.assessDoctorOffDays.mockImplementation((_cells, result) => unavailableAssessmentFromModel(result));
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByText('No safe off-day recommendation')).toBeInTheDocument();
    expect(attendanceModel.fitAttendanceRegression).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(regression.reasons[0]).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/attendance heatmap grid/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Covered average/i).length).toBeGreaterThan(0);
  });

  it('keeps the descriptive heatmap visible when regression throws unexpectedly', () => {
    attendanceModel.fitAttendanceRegression.mockImplementation(() => { throw new Error('Unexpected numerical failure'); });
    attendanceModel.assessDoctorOffDays.mockImplementation((_cells, regression) => unavailableAssessmentFromModel(regression));
    render(<PatientAttendanceHeatmap />);

    expect(attendanceModel.fitAttendanceRegression).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No safe off-day recommendation')).toBeInTheDocument();
    expect(screen.getAllByText(/Attendance regression is unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/attendance heatmap grid/i)).toBeInTheDocument();
  });

  it('shows missing backup coverage for the selected doctor', () => {
    attendanceModel.assessDoctorOffDays.mockReturnValue([{
      ...suggestedAssessment,
      status: 'rejected', safetyScore: null,
      reasons: ['Backup doctor coverage is incomplete.'], passedChecks: [],
      forecast: { ...suggestedAssessment.forecast, backupCoverageRate: 0 },
    }]);
    render(<PatientAttendanceHeatmap />);
    fireEvent.change(screen.getByLabelText(/treating doctor/i), { target: { value: 'doctor-1' } });

    expect(screen.getByText(/selected treating doctor/i)).toBeInTheDocument();
    expect(screen.getAllByText('Backup doctor coverage is incomplete.').length).toBeGreaterThan(0);
  });

  it('does not refit the model when opening a heatmap cell', () => {
    render(<PatientAttendanceHeatmap />);
    expect(attendanceModel.fitAttendanceRegression).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Monday 08:00–09:00.*2.*wait alert/i }));

    expect(attendanceModel.fitAttendanceRegression).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['loading', { data: undefined, isLoading: true, isError: false, error: null }, /loading attendance heatmap/i],
    ['error', { data: undefined, isLoading: false, isError: true, error: new Error('Unavailable'), }, /unavailable/i],
    ['empty', { data: { ...report, hasAttendanceData: false, cells: Array.from({ length: 112 }, (_, index) => ({
      weekday: (Math.floor(index / 16) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      hour: (index % 16) + 8, totalVisits: 0, rawTotalVisits: 0, operatingOccurrences: 0,
      averageVisits: null, medianVisits: null, peakVisits: null, averageWaitMinutes: null,
      waitMeasuredVisits: 0, comparisonAverageVisits: null, comparisonAbsoluteChange: null,
      comparisonPercentChange: null, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'uncovered' as const,
    })) }, isLoading: false, isError: false, error: null }, /no attendance data/i],
  ])('shows the %s state', (_name, query, expected) => {
    useAttendanceHeatmap.mockReturnValue(query);
    render(<PatientAttendanceHeatmap />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows an invalid-range message before querying invalid custom dates', () => {
    render(<PatientAttendanceHeatmap />);

    fireEvent.change(screen.getByLabelText(/attendance period/i), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText(/custom start date/i), { target: { value: '2026-08-16' } });
    fireEvent.change(screen.getByLabelText(/custom end date/i), { target: { value: '2026-08-15' } });
    expect(screen.getByText(/invalid date range/i)).toBeInTheDocument();
  });
});
