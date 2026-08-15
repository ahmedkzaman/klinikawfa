import { describe, expect, it } from 'vitest';
import {
  assessDoctorOffDays,
  buildAttendanceRecommendations,
  normalizeAttendanceHeatmapReport,
  type AttendanceHeatmapCell,
} from '@/lib/clinic/attendanceHeatmap';
import type {
  AttendanceHourlyForecast,
  AttendanceRegressionResult,
  AttendanceWeekdayForecast,
} from '@/lib/clinic/attendanceRegression';
import { fitAttendanceRegression, type AttendanceRegressionObservation } from '@/lib/clinic/attendanceRegression';

const period = {
  startDate: '2026-05-01',
  endDate: '2026-07-31',
  comparisonStartDate: '2026-01-29',
  comparisonEndDate: '2026-04-30',
  timezone: 'Asia/Kuala_Lumpur' as const,
};

function cell(overrides: Partial<AttendanceHeatmapCell> = {}): AttendanceHeatmapCell {
  return {
    weekday: 1,
    hour: 8,
    totalVisits: 16,
    rawTotalVisits: 16,
    operatingOccurrences: 8,
    averageVisits: 2,
    medianVisits: 2,
    peakVisits: 3,
    averageWaitMinutes: 10,
    waitMeasuredVisits: 8,
    comparisonAverageVisits: 1,
    comparisonAbsoluteChange: 1,
    comparisonPercentChange: 100,
    otherDoctorCoveredOccurrences: 0,
    dates: [],
    coverage: 'complete',
    ...overrides,
  };
}

function hourlyForecast(overrides: Partial<AttendanceHourlyForecast> = {}): AttendanceHourlyForecast {
  const expectedVisits = overrides.expectedVisits ?? 0.5;
  return {
    weekday: 1,
    hour: 8,
    expectedVisits,
    lowerPrediction: Math.max(0, expectedVisits - 1),
    upperPrediction: expectedVisits + 1,
    observedAverage: expectedVisits,
    observedMedian: expectedVisits,
    observedPeak: Math.ceil(expectedVisits),
    recentTrend: 0,
    sampleSize: 12,
    averageWaitMinutes: 10,
    waitMeasuredVisits: 12,
    ...overrides,
  };
}

function forecast(weekday: AttendanceWeekdayForecast['weekday'], overrides: Partial<AttendanceWeekdayForecast> = {}): AttendanceWeekdayForecast {
  const expectedTotal = weekday * 10;
  const expectedVisits = weekday * 5;
  return {
    weekday,
    expectedTotal,
    lowerPrediction: expectedTotal - 1,
    upperPrediction: expectedTotal + 1,
    highestExpectedHour: hourlyForecast({
      weekday,
      hour: 8,
      expectedVisits,
      lowerPrediction: expectedVisits - 1,
      upperPrediction: expectedVisits + 1,
    }),
    highestObservedPeak: weekday * 10,
    observedAverage: expectedTotal,
    observedMedian: expectedTotal,
    recentTrend: 0,
    averageWaitMinutes: 10,
    comparableDates: 12,
    backupCoverageRate: 1,
    ...overrides,
  };
}

function readyRegression(target: Partial<AttendanceWeekdayForecast> = {}): Extract<AttendanceRegressionResult, { status: 'ready' }> {
  const weekdays = [forecast(1, {
    expectedTotal: 1,
    lowerPrediction: 0.5,
    upperPrediction: 1.5,
    highestExpectedHour: hourlyForecast({ weekday: 1, hour: 8, expectedVisits: 0.5, lowerPrediction: 0.1, upperPrediction: 0.6 }),
    highestObservedPeak: 1,
    ...target,
  }), forecast(2), forecast(3), forecast(4)];
  return {
    status: 'ready',
    diagnostics: {
      family: 'poisson', converged: true, iterations: 1, usableWeeks: 12,
      observationCount: 48, dispersion: 0, warnings: [],
    },
    hourly: weekdays.map(day => day.highestExpectedHour),
    weekdays,
  };
}

function assessmentCells(): AttendanceHeatmapCell[] {
  return [1, 2, 3, 4, 5, 6, 7].map(weekday => cell({ weekday: weekday as AttendanceHeatmapCell['weekday'] }));
}

function regressionDate(week: number, weekday: number): string {
  return new Date(Date.UTC(2026, 7, 3 + (week * 7) + (weekday - 1))).toISOString().slice(0, 10);
}

function lowAverageHighPeakObservations(): AttendanceRegressionObservation[] {
  return Array.from({ length: 12 }, (_, week) => [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [8, 9].map(hour => ({
    date: regressionDate(week, weekday),
    weekday: weekday as AttendanceRegressionObservation['weekday'],
    hour,
    visits: weekday === 1 ? hour === 9 && week % 3 === 0 ? 14 : 0 : weekday === 6 ? 4 : 3,
    averageWaitMinutes: 15,
    waitMeasuredVisits: 1,
    doctorsRostered: 1 + ((week + weekday + hour) % 2),
    selectedDoctorScheduled: (week + weekday) % 3 === 0,
    backupDoctorCovered: ((week * 2) + weekday + hour) % 4 === 0,
  })))).flat();
}

function assessmentFor(scenario: string) {
  const configuration = (() => {
    switch (scenario) {
      case 'fewer than 8 comparable dates': return { target: { comparableDates: 7 } };
      case 'upper daily prediction reaches the busy-day threshold': return { target: { lowerPrediction: 29, upperPrediction: 30 } };
      case 'predicted daily attendance is not among the lowest eligible weekdays': return {
        target: { expectedTotal: 15, lowerPrediction: 14, upperPrediction: 16 },
      };
      case 'predicted hour enters the busiest quartile': return {
        target: {
          highestExpectedHour: hourlyForecast({ weekday: 1, hour: 8, expectedVisits: 15, lowerPrediction: 14, upperPrediction: 16 }),
        },
        hourly: [0.5, 10, 20, 25],
      };
      case 'observed peak enters the busiest observed-peak quartile': return { target: { highestObservedPeak: 30 } };
      case 'hourly upper prediction crosses the busy threshold': return {
        target: {
          highestExpectedHour: hourlyForecast({ weekday: 1, hour: 8, expectedVisits: 0.5, lowerPrediction: 0.1, upperPrediction: 0.6 }),
        },
        hourly: [0.5, 10, 20, 25],
      };
      case 'average wait exceeds 45 minutes': return { target: { averageWaitMinutes: 46 } };
      case 'volatility is too high': return { target: { lowerPrediction: 0, upperPrediction: 3 } };
      case 'backup doctor coverage is incomplete': return { target: { backupCoverageRate: 0.99 } };
      default: return { target: {} };
    }
  })();
  const regression: AttendanceRegressionResult = scenario === 'fewer than 12 usable weeks'
    ? {
      status: 'unavailable',
      diagnostics: { family: 'poisson', converged: false, iterations: 0, usableWeeks: 11, observationCount: 44, dispersion: 0, warnings: [] },
      reasons: ['At least 12 usable weeks are required.'],
    }
    : readyRegression(configuration.target);
  if (regression.status === 'ready' && scenario === 'predicted daily attendance is not among the lowest eligible weekdays') {
    regression.weekdays[1] = forecast(2, {
      expectedTotal: 1,
      lowerPrediction: 0.5,
      upperPrediction: 1.5,
      highestExpectedHour: hourlyForecast({ weekday: 2, hour: 8, expectedVisits: 0.4, lowerPrediction: 0.1, upperPrediction: 0.5 }),
      highestObservedPeak: 1,
    });
  }
  if (regression.status === 'ready' && configuration.hourly) {
    regression.hourly = configuration.hourly.map((expectedVisits, index) => hourlyForecast({
      weekday: (index + 1) as AttendanceHeatmapCell['weekday'], hour: 8, expectedVisits,
      lowerPrediction: Math.max(0, expectedVisits - 1), upperPrediction: expectedVisits + 1,
    }));
    if (scenario === 'hourly upper prediction crosses the busy threshold') {
      regression.hourly[0].upperPrediction = 20;
    }
  }
  return assessDoctorOffDays(assessmentCells(), regression, 'doctor-1').find(item => item.weekday === 1)!;
}

describe('normalizeAttendanceHeatmapReport', () => {
  it('normalizes aggregate attendance model observations', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [],
      observations: [{
        date: '2026-08-03',
        weekday: 1,
        hour: 8,
        visits: 4,
        averageWaitMinutes: 18.5,
        waitMeasuredVisits: 4,
        doctorsRostered: 2,
        selectedDoctorScheduled: true,
        backupDoctorCovered: true,
      }],
    });

    expect(result.observations).toEqual([{
      date: '2026-08-03', weekday: 1, hour: 8, visits: 4,
      averageWaitMinutes: 18.5, waitMeasuredVisits: 4,
      doctorsRostered: 2, selectedDoctorScheduled: true, backupDoctorCovered: true,
    }]);
  });

  it('discards malformed model observations without discarding descriptive cells', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [{ weekday: 1, hour: 8, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: 2, otherDoctorCoveredOccurrences: 0 }],
      observations: [
        { date: '2026-02-30', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 24, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 8, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: -1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: -1, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: -1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 0, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: 'false', backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: 'false' },
      ],
    });

    expect(result.cells).toHaveLength(1);
    expect(result.observations).toEqual([]);
    expect(result.warnings).toContain('Malformed attendance model observations were discarded.');
  });

  it('caps model observations and warns when the payload exceeds 52 weeks of roster slots', () => {
    const observation = {
      date: '2026-08-03', weekday: 1, hour: 8, visits: 1,
      averageWaitMinutes: null, waitMeasuredVisits: 0,
      doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false,
    };
    const result = normalizeAttendanceHeatmapReport({
      period,
      observations: Array.from({ length: 5_825 }, () => observation),
    });

    expect(result.observations).toHaveLength(5_824);
    expect(result.warnings).toContain('Attendance model observations were truncated.');
  });

  it('retains the latest 52 complete weeks from a dense model payload regardless of input order', () => {
    const observations = Array.from({ length: 53 }, (_, week) => [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => (
      Array.from({ length: 16 }, (_, hourOffset) => ({
        date: regressionDate(week, weekday),
        weekday,
        hour: 8 + hourOffset,
        visits: week,
        averageWaitMinutes: null,
        waitMeasuredVisits: 0,
        doctorsRostered: 1,
        selectedDoctorScheduled: false,
        backupDoctorCovered: false,
      }))
    ))).flat();
    const oldestDate = regressionDate(0, 1);
    const newestDate = regressionDate(52, 7);

    for (const payload of [observations, [...observations].reverse()]) {
      const result = normalizeAttendanceHeatmapReport({ period, observations: payload });
      expect(result.observations).toHaveLength(52 * 7 * 16);
      expect(result.observations.some(item => item.date === oldestDate)).toBe(false);
      expect(result.observations.some(item => item.date === newestDate)).toBe(true);
      expect(result.warnings).toContain('Attendance model observations were truncated to the latest 52 weeks.');
    }
  });

  it('retains the latest 52 distinct weeks from a sparse payload below the row cap', () => {
    const observations = Array.from({ length: 53 }, (_, week) => ({
      date: regressionDate(week, 1),
      weekday: 1,
      hour: 8,
      visits: week,
      averageWaitMinutes: null,
      waitMeasuredVisits: 0,
      doctorsRostered: 1,
      selectedDoctorScheduled: false,
      backupDoctorCovered: false,
    }));
    const result = normalizeAttendanceHeatmapReport({ period, observations });

    expect(result.observations).toHaveLength(52);
    expect(result.observations[0].date).toBe(regressionDate(1, 1));
    expect(result.observations.at(-1)?.date).toBe(regressionDate(52, 1));
    expect(result.warnings).toContain('Attendance model observations were truncated to the latest 52 weeks.');
  });

  it('discards a model observation whose measured-wait count is positive but average wait is null', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      observations: [{
        date: '2026-08-03', weekday: 1, hour: 8, visits: 4,
        averageWaitMinutes: null, waitMeasuredVisits: 1,
        doctorsRostered: 2, selectedDoctorScheduled: true, backupDoctorCovered: true,
      }],
    });

    expect(result.observations).toEqual([]);
    expect(result.warnings).toContain('Malformed attendance model observations were discarded.');
  });

  it('drops out-of-range cells and normalizes malformed metrics without inventing nullable values', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        {
          weekday: 1,
          hour: 8,
          totalVisits: '12',
          operatingOccurrences: '8',
          averageVisits: 'bad',
          medianVisits: 2,
          peakVisits: null,
          averageWaitMinutes: '25.5',
          waitMeasuredVisits: '4',
          comparisonAverageVisits: 4,
          otherDoctorCoveredOccurrences: '3',
          dates: [{ date: '2026-05-05', visits: '2', averageWaitMinutes: 'bad' }],
          coverage: 'complete',
        },
        { weekday: 0, hour: 8 },
        { weekday: 1, hour: 24 },
      ],
      doctors: 'not an array',
      warnings: [null, 'limited roster data'],
    });

    expect(result).toEqual({
      period,
      cells: [expect.objectContaining({
        weekday: 1,
        hour: 8,
        totalVisits: 12,
        rawTotalVisits: 12,
        operatingOccurrences: 8,
        averageVisits: null,
        medianVisits: 2,
        peakVisits: null,
        averageWaitMinutes: 25.5,
        waitMeasuredVisits: 4,
        comparisonAbsoluteChange: null,
        comparisonPercentChange: null,
        otherDoctorCoveredOccurrences: 3,
        dates: [{ date: '2026-05-05', visits: 2, averageWaitMinutes: null }],
        coverage: 'complete',
      })],
      doctors: [],
      hasAttendanceData: true,
      observations: [],
      warnings: ['limited roster data'],
    });
  });

  it('calculates comparison changes only when both comparable averages are valid', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 2, hour: 9, totalVisits: 24, operatingOccurrences: 8, waitMeasuredVisits: 8, otherDoctorCoveredOccurrences: 0, averageVisits: 3, comparisonAverageVisits: 2 },
        { weekday: 2, hour: 10, totalVisits: 24, operatingOccurrences: 8, waitMeasuredVisits: 8, otherDoctorCoveredOccurrences: 0, averageVisits: 3, comparisonAverageVisits: 0 },
      ],
    });

    expect(result.cells[0]).toMatchObject({ comparisonAbsoluteChange: 1, comparisonPercentChange: 50 });
    expect(result.cells[1]).toMatchObject({ comparisonAbsoluteChange: 3, comparisonPercentChange: null });
  });

  it('preserves uncovered roster gaps and marks an all-uncovered response as having no attendance data', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 1, hour: 8, totalVisits: 0, operatingOccurrences: 0, waitMeasuredVisits: 0, otherDoctorCoveredOccurrences: 0, coverage: 'uncovered' },
        { weekday: 1, hour: 9, totalVisits: 0, operatingOccurrences: 0, waitMeasuredVisits: 0, otherDoctorCoveredOccurrences: 0, coverage: 'uncovered' },
      ],
    });

    expect(result.cells.every((item) => item.coverage === 'uncovered')).toBe(true);
    expect(result.hasAttendanceData).toBe(false);
  });

  it('rejects cells with missing, malformed, or negative required aggregate counts', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 1, hour: 8, operatingOccurrences: 8, waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 9, totalVisits: 2, operatingOccurrences: 'eight', waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 10, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: -1, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 11, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: null },
      ],
    });

    expect(result.cells).toEqual([]);
  });

  it('rejects malformed date summaries instead of reporting zero visits', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [{
        weekday: 1,
        hour: 8,
        totalVisits: 2,
        operatingOccurrences: 8,
        waitMeasuredVisits: 2,
        otherDoctorCoveredOccurrences: 0,
        dates: [
          { date: '2026-05-05', visits: 'bad' },
          { date: '2026-05-06', visits: -1 },
          { date: '2026-05-07', visits: 2 },
        ],
      }],
    });

    expect(result.cells[0]?.dates).toEqual([{ date: '2026-05-07', visits: 2, averageWaitMinutes: null }]);
  });
});

describe('assessDoctorOffDays', () => {
  it.each([
    ['fewer than 12 usable weeks', 'Not enough data for regression recommendation'],
    ['fewer than 8 comparable dates', 'Fewer than 8 comparable dates.'],
    ['predicted daily attendance is not among the lowest eligible weekdays', 'Predicted daily attendance is not among the lowest eligible weekdays.'],
    ['upper daily prediction reaches the busy-day threshold', 'Daily upper prediction reaches the busy-day threshold.'],
    ['observed peak enters the busiest observed-peak quartile', 'Observed peak is in the busiest weekday quartile.'],
    ['hourly upper prediction crosses the busy threshold', 'Hourly upper prediction crosses the busy threshold.'],
    ['average wait exceeds 45 minutes', 'Average wait exceeds 45 minutes.'],
    ['volatility is too high', 'Prediction volatility is too high.'],
    ['backup doctor coverage is incomplete', 'Backup doctor coverage is incomplete.'],
  ])('rejects a weekday only when %s', (scenario, expectedReason) => {
    expect(assessmentFor(scenario)).toMatchObject({
      status: 'rejected',
      reasons: [expectedReason],
    });
  });

  it('rejects a low-average weekday with one very high observed peak', () => {
    const assessment = assessmentFor('observed peak enters the busiest observed-peak quartile');

    expect(assessment).toMatchObject({
      status: 'rejected',
      weekday: 1,
      reasons: expect.arrayContaining(['Observed peak is in the busiest weekday quartile.']),
    });
  });

  it('uses the exact insufficient-data copy as the primary reason', () => {
    expect(assessmentFor('fewer than 12 usable weeks').reasons[0]).toBe('Not enough data for regression recommendation');
  });

  it('rejects a ready-shaped result with fewer than 12 usable weeks', () => {
    const regression = readyRegression();
    regression.diagnostics.usableWeeks = 11;

    expect(assessDoctorOffDays(assessmentCells(), regression)[0]).toMatchObject({
      status: 'rejected',
      reasons: ['Not enough data for regression recommendation'],
    });
  });

  it('uses every hour to reject a lower-mean hour whose upper prediction reaches the busy threshold', () => {
    const regression = readyRegression();
    regression.hourly = [
      hourlyForecast({ weekday: 1, hour: 8, expectedVisits: 0.5, lowerPrediction: 0.1, upperPrediction: 0.6 }),
      hourlyForecast({ weekday: 1, hour: 9, expectedVisits: 0.1, lowerPrediction: 0, upperPrediction: 3 }),
      hourlyForecast({ weekday: 2, hour: 8, expectedVisits: 2, lowerPrediction: 1, upperPrediction: 2.5 }),
      hourlyForecast({ weekday: 3, hour: 8, expectedVisits: 3, lowerPrediction: 2, upperPrediction: 3.5 }),
      hourlyForecast({ weekday: 4, hour: 8, expectedVisits: 4, lowerPrediction: 3, upperPrediction: 4.5 }),
    ];

    expect(assessDoctorOffDays(assessmentCells(), regression, 'doctor-1').find(item => item.weekday === 1)).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['Hourly upper prediction crosses the busy threshold.']),
    });
  });

  it('uses every hourly mean to set and enforce the busiest predicted quartile', () => {
    const regression = readyRegression();
    regression.hourly = [
      hourlyForecast({ weekday: 1, hour: 8, expectedVisits: 0.5, lowerPrediction: 0.1, upperPrediction: 0.6 }),
      ...Array.from({ length: 12 }, (_, index) => hourlyForecast({
        weekday: ((index % 3) + 2) as AttendanceHeatmapCell['weekday'],
        hour: 8 + Math.floor(index / 3),
        expectedVisits: 0.1,
        lowerPrediction: 0,
        upperPrediction: 0.2,
      })),
      hourlyForecast({ weekday: 2, hour: 12, expectedVisits: 10, lowerPrediction: 9, upperPrediction: 11 }),
      hourlyForecast({ weekday: 3, hour: 12, expectedVisits: 20, lowerPrediction: 19, upperPrediction: 21 }),
      hourlyForecast({ weekday: 4, hour: 12, expectedVisits: 30, lowerPrediction: 29, upperPrediction: 31 }),
    ];

    expect(assessDoctorOffDays(assessmentCells(), regression, 'doctor-1').find(item => item.weekday === 1)).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['Predicted busiest hour is in the busiest quartile.']),
    });
  });

  it('applies the backup veto only when a doctor is selected', () => {
    const allDoctors = assessDoctorOffDays(assessmentCells(), readyRegression({ backupCoverageRate: 0 }), null)
      .find(item => item.weekday === 1)!;
    const selectedDoctor = assessDoctorOffDays(assessmentCells(), readyRegression({ backupCoverageRate: 0.99 }), 'doctor-1')
      .find(item => item.weekday === 1)!;

    expect(allDoctors.reasons).not.toContain('Backup doctor coverage is incomplete.');
    expect(selectedDoctor).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['Backup doctor coverage is incomplete.']),
    });
  });

  it('ranks passing weekdays by lower-is-safer score and weekday tie-breaker', () => {
    const regression = readyRegression();
    regression.weekdays[1] = forecast(2, {
      expectedTotal: 1,
      lowerPrediction: 0.5,
      upperPrediction: 1.5,
      highestExpectedHour: hourlyForecast({ weekday: 2, hour: 8, expectedVisits: 0.5, lowerPrediction: 0.1, upperPrediction: 0.6 }),
      highestObservedPeak: 1,
    });
    regression.hourly = regression.weekdays.map(day => day.highestExpectedHour);
    const assessments = assessDoctorOffDays(assessmentCells(), regression, 'doctor-1');

    expect(assessments.filter(item => item.status === 'suggested').map(item => item.weekday)).toEqual([1, 2]);
    expect(assessments.find(item => item.weekday === 1)?.safetyScore).toBe(assessments.find(item => item.weekday === 2)?.safetyScore);
  });

  it('rejects the actual low-average weekday with a high observed peak from regression', () => {
    const result = fitAttendanceRegression(lowAverageHighPeakObservations(), 'doctor-1');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const actualMondayPeak = result.weekdays.find(forecast => forecast.weekday === 1)!.highestObservedPeak;
    const regression = readyRegression({ highestObservedPeak: actualMondayPeak });
    regression.weekdays.slice(1).forEach((forecast, index) => {
      forecast.highestObservedPeak = index + 1;
    });
    const assessments = assessDoctorOffDays(assessmentCells(), regression, 'doctor-1');

    expect(assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        weekday: 1,
        status: 'rejected',
        reasons: ['Observed peak is in the busiest weekday quartile.'],
      }),
    ]));
    expect(assessments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ weekday: 1, status: 'suggested' }),
    ]));
  });

  it('carries SQL-shaped model output through the real assessment for selected and all-doctor views', () => {
    const selectedObservations = lowAverageHighPeakObservations().map((item, index) => {
      const backupDoctorCovered = index % 3 !== 0;
      return {
        ...item,
        doctorsRostered: 1 + Number(backupDoctorCovered),
        selectedDoctorScheduled: true,
        backupDoctorCovered,
      };
    });
    const allDoctorObservations = selectedObservations.map((item, index) => ({
      ...item,
      doctorsRostered: 1 + Number(index % 3 !== 0),
      selectedDoctorScheduled: false,
      backupDoctorCovered: false,
    }));
    const selectedRegression = fitAttendanceRegression(selectedObservations, 'doctor-1');
    const allDoctorRegression = fitAttendanceRegression(allDoctorObservations, null);

    expect(selectedRegression.status).toBe('ready');
    expect(allDoctorRegression.status).toBe('ready');
    if (selectedRegression.status !== 'ready' || allDoctorRegression.status !== 'ready') return;
    const selectedAssessments = assessDoctorOffDays(assessmentCells(), selectedRegression, 'doctor-1');
    const allDoctorAssessments = assessDoctorOffDays(assessmentCells(), allDoctorRegression, null);

    expect(selectedAssessments.some(item => item.reasons.includes('Backup doctor coverage is incomplete.'))).toBe(true);
    expect(selectedAssessments.some(item => item.reasons.includes('Hourly upper prediction crosses the busy threshold.'))).toBe(true);
    expect(allDoctorAssessments.every(item => !item.reasons.includes('Backup doctor coverage is incomplete.'))).toBe(true);
  });
});

describe('buildAttendanceRecommendations', () => {
  it('offers a two-hour quiet training window with sample and evidence', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ hour: 8, averageVisits: 1, medianVisits: 1, peakVisits: 1 }),
      cell({ hour: 9, averageVisits: 1, medianVisits: 1, peakVisits: 2 }),
      cell({ hour: 10, averageVisits: 8, medianVisits: 8, peakVisits: 9 }),
      cell({ weekday: 2, hour: 8, averageVisits: 6 }),
    ]);

    expect(recommendations.trainingWindows).toEqual([expect.objectContaining({
      weekday: 1,
      startHour: 8,
      endHour: 10,
      sampleSize: 16,
      evidence: expect.objectContaining({ averageVisits: 1, peakVisits: 2 }),
    })]);
  });

  it('suppresses quiet training windows that are unsafe or insufficiently sampled', () => {
    const unsafe = [
      cell({ hour: 8, averageVisits: 1, averageWaitMinutes: 46 }),
      cell({ hour: 9, averageVisits: 1 }),
    ];
    const insufficient = [
      cell({ hour: 8, operatingOccurrences: 7, coverage: 'complete', averageVisits: 1 }),
      cell({ hour: 9, operatingOccurrences: 7, coverage: 'complete', averageVisits: 1 }),
    ];

    expect(buildAttendanceRecommendations(unsafe).trainingWindows).toEqual([]);
    expect(buildAttendanceRecommendations(insufficient).trainingWindows).toEqual([]);
  });

  it('does not construct average-based doctor off-day suggestions', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, totalVisits: 16, averageVisits: 2, peakVisits: 3 }),
      cell({ weekday: 1, hour: 9, totalVisits: 24, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 2, hour: 8, totalVisits: 8, averageVisits: 1, peakVisits: 2 }),
      cell({ weekday: 2, hour: 9, totalVisits: 8, averageVisits: 1, peakVisits: 2 }),
      cell({ weekday: 3, hour: 8, totalVisits: 40, averageVisits: 5, peakVisits: 6 }),
      cell({ weekday: 3, hour: 9, totalVisits: 40, averageVisits: 5, peakVisits: 6 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).toEqual([]);
  });

  it('suppresses the lowest weekday when its peak hour is in the busiest quartile', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, averageVisits: 0.5, peakVisits: 1 }),
      cell({ weekday: 1, hour: 9, averageVisits: 4, peakVisits: 5 }),
      cell({ weekday: 2, hour: 8, averageVisits: 2, peakVisits: 3 }),
      cell({ weekday: 2, hour: 9, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 3, hour: 8, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 3, hour: 9, averageVisits: 3, peakVisits: 4 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).toEqual([]);
  });

  it('leaves doctor off-day safety decisions to the regression assessment', () => {
    const supported = [
      cell({ weekday: 2, hour: 8, averageVisits: 1, peakVisits: 2, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 2, hour: 9, averageVisits: 1, peakVisits: 2, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 3, hour: 8, averageVisits: 4, peakVisits: 5, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 3, hour: 9, averageVisits: 4, peakVisits: 5, otherDoctorCoveredOccurrences: 8 }),
    ];

    expect(buildAttendanceRecommendations(supported, 'doctor-1').possibleDoctorOffDays).toEqual([]);
    expect(buildAttendanceRecommendations([
      supported[0],
      cell({ ...supported[1], otherDoctorCoveredOccurrences: 7 }),
      supported[2],
      supported[3],
    ], 'doctor-1').possibleDoctorOffDays).toEqual([]);
  });

  it('does not infer an off-day from only the complete part of an incompletely covered weekday', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, averageVisits: 1 }),
      cell({ weekday: 1, hour: 9, operatingOccurrences: 7, coverage: 'insufficient', averageVisits: 0 }),
      cell({ weekday: 2, hour: 8, averageVisits: 3 }),
      cell({ weekday: 2, hour: 9, averageVisits: 3 }),
      cell({ weekday: 3, hour: 8, averageVisits: 5 }),
      cell({ weekday: 3, hour: 9, averageVisits: 5 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ weekday: 1 }),
    ]));
  });

  it('identifies busiest periods and unusually high waits for staffing review', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ hour: 8, averageVisits: 1 }),
      cell({ hour: 9, averageVisits: 2 }),
      cell({ hour: 10, averageVisits: 3 }),
      cell({ hour: 11, averageVisits: 4, averageWaitMinutes: 46 }),
    ]);

    expect(recommendations.peakStaffing).toEqual(expect.arrayContaining([
      expect.objectContaining({ weekday: 1, hour: 11, sampleSize: 8, evidence: expect.objectContaining({ averageWaitMinutes: 46 }) }),
    ]));
  });

  it('flags unstable peaks materially above typical volume', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ medianVisits: 2, averageVisits: 2, peakVisits: 6 }),
    ]);

    expect(recommendations.unstablePeaks).toEqual([expect.objectContaining({
      sampleSize: 8,
      evidence: expect.objectContaining({ medianVisits: 2, averageVisits: 2, peakVisits: 6 }),
    })]);
  });

  it('preserves training, staffing, and unstable-period recommendations when model status changes', () => {
    const cells = [
      cell({ weekday: 1, hour: 8, averageVisits: 1, medianVisits: 1, peakVisits: 1 }),
      cell({ weekday: 1, hour: 9, averageVisits: 1, medianVisits: 1, peakVisits: 2 }),
      cell({ weekday: 1, hour: 10, averageVisits: 5, medianVisits: 2, peakVisits: 6, averageWaitMinutes: 46 }),
      cell({ weekday: 2, hour: 8, averageVisits: 4, medianVisits: 2, peakVisits: 5 }),
    ];
    const descriptiveLists = (recommendations: ReturnType<typeof buildAttendanceRecommendations>) => ({
      trainingWindows: recommendations.trainingWindows,
      peakStaffing: recommendations.peakStaffing,
      unstablePeaks: recommendations.unstablePeaks,
    });
    const before = descriptiveLists(buildAttendanceRecommendations(cells, 'doctor-1'));

    assessDoctorOffDays(cells, readyRegression(), 'doctor-1');
    const ready = descriptiveLists(buildAttendanceRecommendations(cells, 'doctor-1'));
    assessDoctorOffDays(cells, {
      status: 'unavailable',
      diagnostics: { family: 'poisson', converged: false, iterations: 0, usableWeeks: 11, observationCount: 0, dispersion: 0, warnings: [] },
      reasons: ['At least 12 usable weeks are required.'],
    }, 'doctor-1');
    const unavailable = descriptiveLists(buildAttendanceRecommendations(cells, 'doctor-1'));

    expect(ready).toEqual(before);
    expect(unavailable).toEqual(before);
  });
});
