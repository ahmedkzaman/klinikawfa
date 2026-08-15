import { describe, expect, it } from 'vitest';
import {
  __attendanceRegressionTestables,
  fitAttendanceRegression,
  type AttendanceRegressionObservation,
} from '@/lib/clinic/attendanceRegression';

const { buildAttendanceDesignMatrix, fitCoefficientMap } = __attendanceRegressionTestables;

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
    doctorsRostered: 1 + ((week + weekday + hour) % 2),
    selectedDoctorScheduled: (week + weekday) % 3 === 0,
    backupDoctorCovered: ((week * 2) + weekday + hour) % 4 === 0,
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
    visits: (week, weekday, hour) => weekday === 6 && hour === 9 && [1, 2, 6, 10].includes(week) ? 50 : 2 + ((week + weekday) % 2),
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

function sqlShapedSelectedDoctorFixture(weeks = 12): AttendanceRegressionObservation[] {
  return syntheticObservations({ weeks }).map((item, index) => {
    const backupDoctorCovered = index % 3 === 0;
    return {
      ...item,
      doctorsRostered: 1 + Number(backupDoctorCovered),
      selectedDoctorScheduled: true,
      backupDoctorCovered,
    };
  });
}

function risingSeriesFixture(): AttendanceRegressionObservation[] {
  return syntheticObservations({
    weeks: 12,
    visits: (week) => 2 + week,
  }).map(item => ({
    ...item,
    doctorsRostered: 1,
    selectedDoctorScheduled: false,
    backupDoctorCovered: false,
  }));
}

function knownCoefficientFixture(): AttendanceRegressionObservation[] {
  const weeks = 20;
  const center = (weeks - 1) / 2;
  return Array.from({ length: weeks }, (_, week) => [1, 2].flatMap(weekday => [8, 9].map(hour => {
    const doctorsRostered = 1 + Number(((week * 3) + weekday + hour) % 4 === 0);
    const selectedDoctorScheduled = ((week * 2) + weekday + hour) % 5 < 2;
    const backupDoctorCovered = ((week * 5) + (weekday * 2) + hour) % 7 < 3;
    const logMean = 2.6
      + (weekday === 2 ? 0.35 : 0)
      + (hour === 9 ? 0.25 : 0)
      + (0.04 * (week - center))
      + (0.30 * doctorsRostered)
      + (selectedDoctorScheduled ? 0.20 : 0)
      - (backupDoctorCovered ? 0.15 : 0);
    return observation({
      date: dateFor(week, weekday),
      weekday: weekday as AttendanceRegressionObservation['weekday'],
      hour,
      visits: Math.round(Math.exp(logMean)),
      doctorsRostered,
      selectedDoctorScheduled,
      backupDoctorCovered,
    });
  }))).flat();
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
    expect(fitAttendanceRegression([
      ...syntheticObservations({ weeks: 12 }),
      observation({ visits: Number.NaN }),
    ], null)).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['All observations must be covered and finite.']),
    });
  });

  it('rejects structurally unidentifiable designs before ridge stabilization', () => {
    const result = fitAttendanceRegression(syntheticObservations({ weeks: 12 })
      .filter(item => (item.weekday === 1 && item.hour === 8) || (item.weekday === 2 && item.hour === 9))
      .map(item => ({
        ...item,
        doctorsRostered: 1,
        selectedDoctorScheduled: false,
        backupDoctorCovered: false,
      })), null);

    expect(result).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['The design matrix is structurally unidentifiable.']),
    });
  });

  it('omits invariant production-shaped predictors without rejecting an otherwise estimable fit', () => {
    const allDoctors = poissonLikeFixture().map(item => ({
      ...item,
      doctorsRostered: 2,
      selectedDoctorScheduled: false,
      backupDoctorCovered: false,
    }));
    const selectedDoctor = poissonLikeFixture().map(item => ({
      ...item,
      doctorsRostered: 2,
      selectedDoctorScheduled: true,
      backupDoctorCovered: true,
    }));

    expect(buildAttendanceDesignMatrix(allDoctors).featureNames).not.toEqual(expect.arrayContaining([
      'doctors_rostered', 'selected_doctor_scheduled', 'backup_doctor_covered',
    ]));
    expect(buildAttendanceDesignMatrix(selectedDoctor).featureNames).not.toEqual(expect.arrayContaining([
      'doctors_rostered', 'selected_doctor_scheduled', 'backup_doctor_covered',
    ]));
    expect(fitAttendanceRegression(allDoctors, null)).toMatchObject({ status: 'ready' });
    expect(fitAttendanceRegression(selectedDoctor, 'doctor-1')).toMatchObject({ status: 'ready' });
  });

  it('keeps a SQL-shaped selected-doctor fit available when roster count equals one plus backup coverage', () => {
    const result = fitAttendanceRegression(sqlShapedSelectedDoctorFixture(), 'doctor-1');

    expect(result).toMatchObject({ status: 'ready', diagnostics: { usableWeeks: 12 } });
  });

  it('encodes weekday, hour, month, trend, roster count, selected doctor, and backup coverage', () => {
    const matrix = buildAttendanceDesignMatrix(syntheticObservations({ weeks: 12 }));
    expect(matrix.featureNames).toEqual(expect.arrayContaining([
      'weekday_2', 'hour_9', 'month_9', 'week_trend',
      'doctors_rostered', 'selected_doctor_scheduled', 'backup_doctor_covered',
    ]));
    expect(matrix.featureNames).not.toContain('month_8');
    expect(matrix.featureNames[0]).toBe('intercept');
    expect(matrix.values.every(row => row.length === matrix.featureNames.length)).toBe(true);
  });

  it('uses the earliest observed month as a stable reference regardless of input order', () => {
    const augustAndSeptember = [
      observation({ date: '2026-08-03', weekday: 1, hour: 8 }),
      observation({ date: '2026-09-01', weekday: 2, hour: 9 }),
    ];
    const inOrder = buildAttendanceDesignMatrix(augustAndSeptember);
    const shuffled = buildAttendanceDesignMatrix([...augustAndSeptember].reverse());

    expect(inOrder.featureNames).not.toContain('month_8');
    expect(inOrder.featureNames).toContain('month_9');
    expect(shuffled.featureNames).toEqual(inOrder.featureNames);
  });

  it('uses the chronologically earliest retained month as reference across a year boundary', () => {
    const decemberAndJanuary = [
      observation({ date: '2026-12-07', weekday: 1, hour: 8 }),
      observation({ date: '2027-01-05', weekday: 2, hour: 9 }),
    ];
    const inOrder = buildAttendanceDesignMatrix(decemberAndJanuary);
    const shuffled = buildAttendanceDesignMatrix([...decemberAndJanuary].reverse());

    expect(inOrder.featureNames).not.toContain('month_12');
    expect(inOrder.featureNames).toContain('month_1');
    expect(shuffled.featureNames).toEqual(inOrder.featureNames);
  });

  it('recovers the direction and approximate size of known weekday, hour, trend, and doctor-coverage effects', () => {
    const effects = fitCoefficientMap(knownCoefficientFixture());

    expect(effects).not.toBeNull();
    expect(effects?.weekday_2).toBeCloseTo(0.35, 1);
    expect(effects?.hour_9).toBeCloseTo(0.25, 1);
    expect(effects?.week_trend).toBeCloseTo(0.04, 1);
    expect(effects?.doctors_rostered).toBeCloseTo(0.30, 1);
    expect(effects?.selected_doctor_scheduled).toBeCloseTo(0.20, 1);
    expect(effects?.backup_doctor_covered).toBeCloseTo(-0.15, 1);
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

  it('returns unavailable when the count fit does not converge within its iteration limit', () => {
    const result = fitAttendanceRegression(syntheticObservations({ weeks: 12, visits: () => 0 }), null);
    expect(result).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['The Poisson fit did not converge.']),
    });
  });

  it('keeps ready forecast estimates and prediction bounds finite and non-negative', () => {
    const result = fitAttendanceRegression(overdispersedFixture(), null);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      [...result.hourly, ...result.weekdays.map(day => day.highestExpectedHour)].forEach(forecast => {
        expect(Number.isFinite(forecast.expectedVisits)).toBe(true);
        expect(Number.isFinite(forecast.lowerPrediction)).toBe(true);
        expect(Number.isFinite(forecast.upperPrediction)).toBe(true);
        expect(forecast.expectedVisits).toBeGreaterThanOrEqual(0);
        expect(forecast.lowerPrediction).toBeGreaterThanOrEqual(0);
        expect(forecast.upperPrediction).toBeGreaterThanOrEqual(0);
      });
      result.weekdays.forEach(forecast => {
        expect(Number.isFinite(forecast.expectedTotal)).toBe(true);
        expect(Number.isFinite(forecast.lowerPrediction)).toBe(true);
        expect(Number.isFinite(forecast.upperPrediction)).toBe(true);
        expect(forecast.expectedTotal).toBeGreaterThanOrEqual(0);
        expect(forecast.lowerPrediction).toBeGreaterThanOrEqual(0);
        expect(forecast.upperPrediction).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('projects a rising weekly series at the latest forecast point and exposes observed context', () => {
    const result = fitAttendanceRegression(risingSeriesFixture(), null);

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      const monday = result.weekdays.find(day => day.weekday === 1)!;
      expect(monday.observedAverage).toBeCloseTo(15, 5);
      expect(monday.observedMedian).toBeCloseTo(15, 5);
      expect(monday.expectedTotal).toBeGreaterThan(20);
      expect(monday.expectedTotal).toBeGreaterThan(monday.observedAverage);
      expect(monday.recentTrend).toBeGreaterThan(0);
      expect(monday.highestExpectedHour.averageWaitMinutes).toBe(15);
      expect(monday.highestExpectedHour.waitMeasuredVisits).toBe(24);
    }
  });

  it('keeps only the latest 52 distinct weeks when called directly with a longer sparse sample', () => {
    const observations = syntheticObservations({ weeks: 53 }).map((item, index) => index < 14
      ? { ...item, visits: 500 }
      : item);
    const result = fitAttendanceRegression(observations, null);
    const latestOnly = fitAttendanceRegression(observations.slice(14), null);

    expect(result).toMatchObject({ status: 'ready', diagnostics: { usableWeeks: 52 } });
    expect(latestOnly.status).toBe('ready');
    if (result.status === 'ready' && latestOnly.status === 'ready') {
      expect(result.weekdays.map(day => day.expectedTotal))
        .toEqual(latestOnly.weekdays.map(day => day.expectedTotal));
    }
  });

  it('rejects a positive measured-wait count with a null wait average', () => {
    const result = fitAttendanceRegression(risingSeriesFixture().map((item, index) => index === 0
      ? { ...item, waitMeasuredVisits: 1, averageWaitMinutes: null }
      : item), null);

    expect(result).toMatchObject({
      status: 'unavailable',
      reasons: expect.arrayContaining(['All observations must be covered and finite.']),
    });
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
