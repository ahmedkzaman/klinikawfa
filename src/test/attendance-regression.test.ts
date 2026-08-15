import { describe, expect, it } from 'vitest';
import {
  __attendanceRegressionTestables,
  fitAttendanceRegression,
  type AttendanceRegressionObservation,
} from '@/lib/clinic/attendanceRegression';

const { buildAttendanceDesignMatrix } = __attendanceRegressionTestables;

function dateFor(week: number, weekday: number): string {
  const date = new Date(Date.UTC(2026, 7, 3 + (week * 7) + (weekday - 1)));
  return date.toISOString().slice(0, 10);
}

function observation(overrides: Partial<AttendanceRegressionObservation> = {}): AttendanceRegressionObservation {
  return {
    date: '2026-08-03',
    weekday: 1,
    hour: 8,
    visits: 2,
    averageWaitMinutes: 15,
    waitMeasuredVisits: 2,
    doctorsRostered: 1,
    selectedDoctorScheduled: false,
    backupDoctorCovered: false,
    ...overrides,
  };
}

function syntheticObservations({ weeks, visits = (week: number, weekday: number, hour: number) => 2 + ((week + weekday + hour) % 3) }: {
  weeks: number;
  visits?: (week: number, weekday: number, hour: number) => number;
}): AttendanceRegressionObservation[] {
  return Array.from({ length: weeks }, (_, week) => [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [8, 9].map(hour => observation({
    date: dateFor(week, weekday),
    weekday: weekday as AttendanceRegressionObservation['weekday'],
    hour,
    visits: visits(week, weekday, hour),
    doctorsRostered: weekday === 6 ? 2 : 1,
    selectedDoctorScheduled: weekday !== 6,
    backupDoctorCovered: weekday === 6,
  })))).flat();
}

function poissonLikeFixture(): AttendanceRegressionObservation[] {
  return syntheticObservations({
    weeks: 12,
    visits: (week, weekday, hour) => 3 + ((week + weekday + hour) % 2),
  });
}

function overdispersedFixture(): AttendanceRegressionObservation[] {
  return syntheticObservations({
    weeks: 12,
    visits: (week, weekday, hour) => weekday === 6 && hour === 9 && week % 3 === 0 ? 20 : 2 + ((week + weekday) % 2),
  });
}

function lowAverageHighPeakFixture(): AttendanceRegressionObservation[] {
  return syntheticObservations({
    weeks: 12,
    visits: (week, weekday, hour) => {
      if (weekday === 1) return hour === 9 && week % 3 === 0 ? 14 : 0;
      if (weekday === 6) return 4;
      return 3;
    },
  });
}

function peakBusyThreshold(result: ReturnType<typeof fitAttendanceRegression>): number {
  if (result.status !== 'ready') return Infinity;
  return result.weekdays.find(day => day.weekday === 6)!.highestExpectedHour.expectedVisits;
}

describe('fitAttendanceRegression', () => {
  it('rejects uncovered, invalid, or shorter-than-12-week samples', () => {
    expect(fitAttendanceRegression([], null)).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['At least 12 usable weeks are required.']),
    });
    expect(fitAttendanceRegression(syntheticObservations({ weeks: 11 }), null)).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['At least 12 usable weeks are required.']),
    });
    expect(fitAttendanceRegression([observation({ doctorsRostered: 0 })], null)).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['No covered, valid observations are available.']),
    });
    expect(fitAttendanceRegression([observation({ visits: Number.NaN })], null)).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['No covered, valid observations are available.']),
    });
  });

  it('encodes weekday, hour, month, trend, roster count, selected doctor, and backup coverage', () => {
    const matrix = buildAttendanceDesignMatrix(syntheticObservations({ weeks: 12 }));
    expect(matrix.featureNames).toEqual(expect.arrayContaining([
      'weekday_2', 'hour_9', 'month_8', 'week_trend',
      'doctors_rostered', 'selected_doctor_scheduled', 'backup_doctor_covered',
    ]));
    expect(matrix.featureNames[0]).toBe('intercept');
    expect(matrix.values.every(row => row.length === matrix.featureNames.length)).toBe(true);
  });

  it('uses the Poisson limit for stable equidispersed counts', () => {
    const result = fitAttendanceRegression(poissonLikeFixture(), null);
    expect(result).toMatchObject({ status: 'ready', diagnostics: { family: 'poisson', converged: true } });
  });

  it('uses negative binomial variance when peak dispersion is material', () => {
    const result = fitAttendanceRegression(overdispersedFixture(), null);
    expect(result).toMatchObject({ status: 'ready', diagnostics: { family: 'negative_binomial', converged: true } });
    if (result.status === 'ready') expect(result.diagnostics.dispersion).toBeGreaterThan(0);
  });

  it('preserves a low average weekday but exposes its dangerous peak bound', () => {
    const result = fitAttendanceRegression(lowAverageHighPeakFixture(), null);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      const monday = result.weekdays.find(day => day.weekday === 1)!;
      expect(monday.expectedTotal).toBeLessThan(result.weekdays.find(day => day.weekday === 6)!.expectedTotal);
      expect(monday.highestExpectedHour.upperPrediction).toBeGreaterThanOrEqual(peakBusyThreshold(result));
    }
  });
});
