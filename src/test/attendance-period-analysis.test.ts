import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_PERIODS,
  buildAttendancePeriodAnalysis,
} from '@/lib/clinic/attendancePeriodAnalysis';
import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';
import type { AttendanceRegressionResult, AttendanceHourlyForecast } from '@/lib/clinic/attendanceRegression';

const forecast = (weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, hour: number, expectedVisits: number, bound = 1): AttendanceHourlyForecast => ({
  weekday,
  hour,
  expectedVisits,
  lowerPrediction: Math.max(0, expectedVisits - bound),
  upperPrediction: expectedVisits + bound,
  observedAverage: expectedVisits,
  observedMedian: expectedVisits,
  observedPeak: expectedVisits,
  recentTrend: 0,
  sampleSize: 12,
  averageWaitMinutes: 10,
  waitMeasuredVisits: 12,
});

const cell = (weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, hour: number, visits: number): AttendanceHeatmapCell => ({
  weekday,
  hour,
  totalVisits: visits * 12,
  rawTotalVisits: visits * 12,
  operatingOccurrences: 12,
  averageVisits: visits,
  medianVisits: visits,
  peakVisits: visits,
  averageWaitMinutes: 10,
  waitMeasuredVisits: 12,
  comparisonAverageVisits: null,
  comparisonAbsoluteChange: null,
  comparisonPercentChange: null,
  otherDoctorCoveredOccurrences: 12,
  dates: [],
  coverage: 'complete',
});

function readyRegression(hourly: AttendanceHourlyForecast[]): AttendanceRegressionResult {
  return {
    status: 'ready',
    diagnostics: {
      family: 'negative_binomial',
      converged: true,
      iterations: 4,
      usableWeeks: 24,
      observationCount: hourly.length,
      dispersion: 0.4,
      warnings: [],
    },
    hourly,
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday: weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      expectedTotal: 64,
      lowerPrediction: 56,
      upperPrediction: 72,
      highestExpectedHour: hourly.find((item) => item.weekday === weekday)!,
      highestObservedPeak: 4,
      observedAverage: 64,
      observedMedian: 64,
      recentTrend: 0,
      averageWaitMinutes: 10,
      comparableDates: 12,
      backupCoverageRate: 1,
    })),
  };
}

describe('attendance period analysis', () => {
  it('defines the three requested operating periods', () => {
    expect(ATTENDANCE_PERIODS.map(({ id, startHour, endHour }) => [id, startHour, endHour])).toEqual([
      ['08_13', 8, 13],
      ['14_19', 14, 19],
      ['20_24', 20, 24],
    ]);
  });

  it('assigns every hour to exactly one period and sums forecast bounds', () => {
    const hours = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23];
    const hourly = hours.map((hour) => forecast(1, hour, 1));
    const result = buildAttendancePeriodAnalysis({
      regression: readyRegression(hourly),
      cells: hourly.map((item) => cell(1, item.hour, 1)),
      offDayAssessments: [],
      selectedDoctorId: null,
    });

    const monday = result.periods.filter((period) => period.weekday === 1);
    expect(monday.map((period) => period.hourly.map((item) => item.forecast.hour))).toEqual([
      [8, 9, 10, 11, 12],
      [14, 15, 16, 17, 18],
      [20, 21, 22, 23],
    ]);
    expect(monday.map((period) => [period.expectedVisits, period.lowerPrediction, period.upperPrediction])).toEqual([
      [5, 0, 10],
      [5, 0, 10],
      [4, 0, 8],
    ]);
  });

  it('marks a period insufficient when one constituent hour lacks coverage', () => {
    const hourly = Array.from({ length: 16 }, (_, index) => forecast(1, index + 8, 1));
    const cells = hourly.map((item) => cell(1, item.hour, 1));
    cells[2] = { ...cells[2], coverage: 'insufficient', operatingOccurrences: 3 };
    const result = buildAttendancePeriodAnalysis({
      regression: readyRegression(hourly),
      cells,
      offDayAssessments: [],
      selectedDoctorId: null,
    });

    expect(result.periods.find((period) => period.weekday === 1 && period.periodId === '08_13')).toMatchObject({
      status: 'insufficient',
      safeForTraining: false,
    });
  });

  it('chooses training and peak periods from regression totals, not raw hourly peaks', () => {
    const hours = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23];
    const hourly = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => hours.map((hour) => {
      const expectedVisits = weekday === 3 && hour >= 14 && hour < 19 ? 6 : weekday === 2 ? 0.5 : 1;
      return forecast(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7, hour, expectedVisits, 0.1);
    }));
    const result = buildAttendancePeriodAnalysis({
      regression: readyRegression(hourly),
      cells: hourly.map((item) => cell(item.weekday, item.hour, item.expectedVisits)),
      offDayAssessments: [],
      selectedDoctorId: null,
    });

    expect(result.decisions.training).toMatchObject({ status: 'ready', weekday: 2, periodId: '20_24' });
    expect(result.decisions.peak).toMatchObject({ status: 'ready', weekday: 3, periodId: '14_19' });
  });

  it('rejects a low-demand training period when one included hour is unsafe', () => {
    const hours = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23];
    const hourly = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => hours.map((hour) => forecast(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7, hour, weekday === 2 ? 0.5 : 1, 0.1)));
    const cells = hourly.map((item) => cell(item.weekday, item.hour, item.expectedVisits));
    const unsafeIndex = cells.findIndex((item) => item.weekday === 2 && item.hour === 9);
    cells[unsafeIndex] = { ...cells[unsafeIndex], averageWaitMinutes: 60 };
    const result = buildAttendancePeriodAnalysis({
      regression: readyRegression(hourly),
      cells,
      offDayAssessments: [],
      selectedDoctorId: null,
    });

    expect(result.periods.find((period) => period.weekday === 2 && period.periodId === '08_13')).toMatchObject({
      safeForTraining: false,
    });
    expect(result.periods.find((period) => period.weekday === 2 && period.periodId === '08_13')?.safetyReasons).toContain('Average wait exceeds 45 minutes.');
  });

  it('uses an existing regression off-day assessment without changing its safety decision', () => {
    const hours = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23];
    const hourly = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => hours.map((hour) => forecast(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7, hour, 1)));
    const regression = readyRegression(hourly);
    const result = buildAttendancePeriodAnalysis({
      regression,
      cells: hourly.map((item) => cell(item.weekday, item.hour, 1)),
      offDayAssessments: [{
        status: 'suggested',
        weekday: 4,
        forecast: regression.weekdays[3],
        safetyScore: 0.12,
        reasons: [],
        passedChecks: ['All regression safety checks passed.'],
      }],
      selectedDoctorId: null,
    });

    expect(result.decisions.offDay).toMatchObject({ status: 'ready', weekday: 4, periodId: null, expectedVisits: 64 });
  });
});
