import type {
  AttendanceRegressionObservation,
  AttendanceRegressionResult,
  AttendanceWeekdayForecast,
} from './attendanceRegression';

export type AttendanceHeatmapCell = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  /** Clinical visits on roster-operating dates only. */
  totalVisits: number;
  /** All qualifying clinical visits, including dates without roster coverage. */
  rawTotalVisits: number;
  operatingOccurrences: number;
  averageVisits: number | null;
  medianVisits: number | null;
  peakVisits: number | null;
  averageWaitMinutes: number | null;
  waitMeasuredVisits: number;
  comparisonAverageVisits: number | null;
  comparisonAbsoluteChange: number | null;
  comparisonPercentChange: number | null;
  otherDoctorCoveredOccurrences: number;
  dates: Array<{
    date: string;
    visits: number;
    averageWaitMinutes: number | null;
  }>;
  coverage: 'complete' | 'insufficient' | 'uncovered';
};

export type AttendanceHeatmapReport = {
  period: {
    startDate: string;
    endDate: string;
    comparisonStartDate: string;
    comparisonEndDate: string;
    timezone: 'Asia/Kuala_Lumpur';
  };
  cells: AttendanceHeatmapCell[];
  observations: AttendanceRegressionObservation[];
  hasAttendanceData: boolean;
  doctors: Array<{ id: string; name: string }>;
  warnings: string[];
};

type RecommendationEvidence = {
  averageVisits: number | null;
  medianVisits: number | null;
  peakVisits: number | null;
  averageWaitMinutes: number | null;
  otherDoctorCoveredOccurrences: number;
};

type AttendanceRecommendation = {
  weekday: AttendanceHeatmapCell['weekday'];
  hour: number;
  sampleSize: number;
  evidence: RecommendationEvidence;
};

type AttendanceOffDayRecommendation = Omit<AttendanceRecommendation, 'hour'>;

export type DoctorOffDayAssessment = {
  status: 'suggested' | 'rejected' | 'unavailable';
  weekday: AttendanceHeatmapCell['weekday'] | null;
  forecast: AttendanceWeekdayForecast | null;
  safetyScore: number | null;
  reasons: string[];
  passedChecks: string[];
};

export type AttendanceRecommendations = {
  trainingWindows: Array<AttendanceRecommendation & { startHour: number; endHour: number }>;
  possibleDoctorOffDays: AttendanceOffDayRecommendation[];
  peakStaffing: AttendanceRecommendation[];
  unstablePeaks: AttendanceRecommendation[];
};

const MINIMUM_COMPARABLE_OCCURRENCES = 8;
const MAXIMUM_MODEL_OBSERVATIONS = 52 * 7 * 16;
const MINIMUM_USABLE_WEEKS = 12;
const MAX_AVERAGE_WAIT_MINUTES = 45;
const MIN_COMPARABLE_DATES = 8;
const MAX_BACKUP_MISS_RATE = 0;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valueOf(source: Record<string, unknown>, camelCase: string): unknown {
  const snakeCase = camelCase.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  return source[camelCase] ?? source[snakeCase];
}

function nullableValueOf(source: Record<string, unknown>, camelCase: string): unknown {
  const snakeCase = camelCase.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  return camelCase in source ? source[camelCase] : source[snakeCase];
}

function finiteNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : fallback;
}

function requiredNonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number === null || number < 0 ? null : number;
}

function nullableNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number === null || number < 0 ? null : number;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function weekdayFromIsoDate(date: string): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function periodFrom(raw: Record<string, unknown>): AttendanceHeatmapReport['period'] {
  const candidate = object(raw.period) ?? {};
  const date = (name: string): string => typeof valueOf(candidate, name) === 'string' ? valueOf(candidate, name) as string : '';
  return {
    startDate: date('startDate'),
    endDate: date('endDate'),
    comparisonStartDate: date('comparisonStartDate'),
    comparisonEndDate: date('comparisonEndDate'),
    timezone: 'Asia/Kuala_Lumpur',
  };
}

function normalizeCell(raw: unknown): AttendanceHeatmapCell | null {
  const source = object(raw);
  if (!source) return null;
  const weekday = finiteNumber(valueOf(source, 'weekday'));
  const hour = finiteNumber(valueOf(source, 'hour'));
  if (weekday === null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  const averageVisits = nullableNumber(valueOf(source, 'averageVisits'));
  const comparisonAverageVisits = nullableNumber(valueOf(source, 'comparisonAverageVisits'));
  const comparisonAbsoluteChange = averageVisits === null || comparisonAverageVisits === null
    ? null
    : averageVisits - comparisonAverageVisits;
  const comparisonPercentChange = comparisonAbsoluteChange === null || comparisonAverageVisits === 0
    ? null
    : (comparisonAbsoluteChange / comparisonAverageVisits) * 100;
  const totalVisits = requiredNonNegativeNumber(valueOf(source, 'totalVisits'));
  const rawTotalVisits = requiredNonNegativeNumber(valueOf(source, 'rawTotalVisits') ?? totalVisits);
  const operatingOccurrences = requiredNonNegativeNumber(valueOf(source, 'operatingOccurrences'));
  const waitMeasuredVisits = requiredNonNegativeNumber(valueOf(source, 'waitMeasuredVisits'));
  const otherDoctorCoveredOccurrences = requiredNonNegativeNumber(valueOf(source, 'otherDoctorCoveredOccurrences'));
  if (totalVisits === null || rawTotalVisits === null || operatingOccurrences === null || waitMeasuredVisits === null || otherDoctorCoveredOccurrences === null) return null;
  const rawDates = valueOf(source, 'dates');

  return {
    weekday: weekday as AttendanceHeatmapCell['weekday'],
    hour,
    totalVisits,
    rawTotalVisits,
    operatingOccurrences,
    averageVisits,
    medianVisits: nullableNumber(valueOf(source, 'medianVisits')),
    peakVisits: nullableNumber(valueOf(source, 'peakVisits')),
    averageWaitMinutes: nullableNumber(valueOf(source, 'averageWaitMinutes')),
    waitMeasuredVisits,
    comparisonAverageVisits,
    comparisonAbsoluteChange,
    comparisonPercentChange,
    otherDoctorCoveredOccurrences,
    dates: Array.isArray(rawDates) ? rawDates.flatMap(item => {
      const date = object(item);
      if (!date || typeof date.date !== 'string') return [];
      const visits = requiredNonNegativeNumber(valueOf(date, 'visits'));
      if (visits === null) return [];
      return [{
        date: date.date,
        visits,
        averageWaitMinutes: nullableNumber(valueOf(date, 'averageWaitMinutes')),
      }];
    }) : [],
    coverage: valueOf(source, 'coverage') === 'uncovered'
      ? 'uncovered'
      : valueOf(source, 'coverage') === 'complete' && operatingOccurrences >= MINIMUM_COMPARABLE_OCCURRENCES
        ? 'complete'
        : 'insufficient',
  };
}

function normalizeObservation(raw: unknown): AttendanceRegressionObservation | null {
  const source = object(raw);
  if (!source) return null;
  const date = isoDate(valueOf(source, 'date'));
  const weekday = finiteNumber(valueOf(source, 'weekday'));
  const hour = finiteNumber(valueOf(source, 'hour'));
  const visits = requiredNonNegativeNumber(valueOf(source, 'visits'));
  const rawAverageWaitMinutes = nullableValueOf(source, 'averageWaitMinutes');
  const averageWaitMinutes = rawAverageWaitMinutes === null
    ? null
    : nullableNumber(rawAverageWaitMinutes);
  const waitMeasuredVisits = requiredNonNegativeNumber(valueOf(source, 'waitMeasuredVisits'));
  const doctorsRostered = requiredNonNegativeNumber(valueOf(source, 'doctorsRostered'));
  const selectedDoctorScheduled = valueOf(source, 'selectedDoctorScheduled');
  const backupDoctorCovered = valueOf(source, 'backupDoctorCovered');

  if (date === null
    || weekday === null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || weekday !== weekdayFromIsoDate(date)
    || hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23
    || visits === null || waitMeasuredVisits === null || doctorsRostered === null || doctorsRostered <= 0
    || averageWaitMinutes === null && rawAverageWaitMinutes !== null
    || typeof selectedDoctorScheduled !== 'boolean' || typeof backupDoctorCovered !== 'boolean') return null;

  return {
    date,
    weekday: weekday as AttendanceRegressionObservation['weekday'],
    hour,
    visits,
    averageWaitMinutes,
    waitMeasuredVisits,
    doctorsRostered,
    selectedDoctorScheduled,
    backupDoctorCovered,
  };
}

export function normalizeAttendanceHeatmapReport(raw: unknown): AttendanceHeatmapReport {
  const source = object(raw) ?? {};
  const rawCells = valueOf(source, 'cells');
  const rawDoctors = valueOf(source, 'doctors');
  const rawWarnings = valueOf(source, 'warnings');
  const rawObservations = valueOf(source, 'observations');
  const cells = Array.isArray(rawCells) ? rawCells.flatMap(cell => {
    const normalized = normalizeCell(cell);
    return normalized ? [normalized] : [];
  }) : [];
  const normalizedObservations = Array.isArray(rawObservations)
    ? rawObservations.flatMap(observation => {
      const normalized = normalizeObservation(observation);
      return normalized ? [normalized] : [];
    })
    : [];
  const observationWarnings = Array.isArray(rawObservations) && normalizedObservations.length !== rawObservations.length
    ? ['Malformed attendance model observations were discarded.']
    : [];
  const observations = normalizedObservations.slice(0, MAXIMUM_MODEL_OBSERVATIONS);
  if (normalizedObservations.length > MAXIMUM_MODEL_OBSERVATIONS) {
    observationWarnings.push('Attendance model observations were truncated.');
  }
  return {
    period: periodFrom(source),
    cells,
    observations,
    hasAttendanceData: cells.some((cell) => cell.rawTotalVisits > 0 || cell.operatingOccurrences > 0),
    doctors: Array.isArray(rawDoctors) ? rawDoctors.flatMap(doctor => {
      const value = object(doctor);
      return value && typeof value.id === 'string' && typeof value.name === 'string' ? [{ id: value.id, name: value.name }] : [];
    }) : [],
    warnings: [
      ...(Array.isArray(rawWarnings) ? rawWarnings.filter((warning): warning is string => typeof warning === 'string') : []),
      ...observationWarnings,
    ],
  };
}

function eligible(cell: AttendanceHeatmapCell): boolean {
  return cell.coverage === 'complete' && cell.operatingOccurrences >= MINIMUM_COMPARABLE_OCCURRENCES && cell.averageVisits !== null;
}

function evidence(cell: AttendanceHeatmapCell): RecommendationEvidence {
  return {
    averageVisits: cell.averageVisits,
    medianVisits: cell.medianVisits,
    peakVisits: cell.peakVisits,
    averageWaitMinutes: cell.averageWaitMinutes,
    otherDoctorCoveredOccurrences: cell.otherDoctorCoveredOccurrences,
  };
}

function recommendation(cell: AttendanceHeatmapCell): AttendanceRecommendation {
  return { weekday: cell.weekday, hour: cell.hour, sampleSize: cell.operatingOccurrences, evidence: evidence(cell) };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function normalizeAcrossEligible(values: number[]): number[] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum === minimum ? values.map(() => 0) : values.map(value => (value - minimum) / (maximum - minimum));
}

function observedPeakPercentile(value: number, peaks: number[]): number {
  return peaks.filter(peak => peak <= value).length / peaks.length;
}

function insufficientDataOffDayAssessments(
  cells: AttendanceHeatmapCell[],
  forecasts: AttendanceWeekdayForecast[] = [],
): DoctorOffDayAssessment[] {
  const assessments = forecasts.length > 0
    ? forecasts.map(forecast => ({ weekday: forecast.weekday, forecast }))
    : [...new Set(cells.map(cell => cell.weekday))].sort((left, right) => left - right).map(weekday => ({ weekday, forecast: null }));
  return (assessments.length > 0 ? assessments : [{ weekday: null, forecast: null }]).map(({ weekday, forecast }) => ({
    status: 'rejected',
    weekday,
    forecast,
    safetyScore: null,
    reasons: ['Not enough data for regression recommendation'],
    passedChecks: [],
  }));
}

function unavailableOffDayAssessments(
  cells: AttendanceHeatmapCell[],
  regression: Extract<AttendanceRegressionResult, { status: 'unavailable' }>,
): DoctorOffDayAssessment[] {
  if (regression.diagnostics.usableWeeks < MINIMUM_USABLE_WEEKS) {
    return insufficientDataOffDayAssessments(cells);
  }
  return [{
    status: 'unavailable',
    weekday: null,
    forecast: null,
    safetyScore: null,
    reasons: regression.reasons,
    passedChecks: [],
  }];
}

export function assessDoctorOffDays(
  cells: AttendanceHeatmapCell[],
  regression: AttendanceRegressionResult,
  selectedDoctorId?: string | null,
): DoctorOffDayAssessment[] {
  void selectedDoctorId;
  if (regression.diagnostics.usableWeeks < MINIMUM_USABLE_WEEKS) {
    return insufficientDataOffDayAssessments(cells, regression.status === 'ready' ? regression.weekdays : []);
  }
  if (regression.status !== 'ready') return unavailableOffDayAssessments(cells, regression);

  const forecasts = [...regression.weekdays].sort((left, right) => left.weekday - right.weekday);
  const busyDailyThreshold = percentile(forecasts.map(day => day.expectedTotal), 0.75);
  const busyHourlyThreshold = percentile(regression.hourly.map(hour => hour.expectedVisits), 0.75);
  const observedWeekdayPeaks = forecasts.map(day => day.highestObservedPeak);
  const observedPeakThreshold = percentile(observedWeekdayPeaks, 0.75);
  const assessments = forecasts.map(forecast => {
    const volatility = (forecast.upperPrediction - forecast.lowerPrediction) / Math.max(forecast.expectedTotal, 1);
    const backupMissRate = 1 - forecast.backupCoverageRate;
    const reasons: string[] = [];
    const passedChecks: string[] = [];
    const check = (passes: boolean, passed: string, rejected: string): void => {
      if (passes) passedChecks.push(passed);
      else reasons.push(rejected);
    };

    check(forecast.comparableDates >= MIN_COMPARABLE_DATES,
      'At least 8 comparable dates.', 'Fewer than 8 comparable dates.');
    check(forecast.upperPrediction < busyDailyThreshold,
      'Daily upper prediction is below the busy-day threshold.', 'Daily upper prediction reaches the busy-day threshold.');
    check(forecast.highestExpectedHour.expectedVisits < busyHourlyThreshold,
      'Predicted busiest hour is below the busiest quartile.', 'Predicted busiest hour is in the busiest quartile.');
    check(forecast.highestObservedPeak < observedPeakThreshold,
      'Observed peak is below the busiest weekday quartile.', 'Observed peak is in the busiest weekday quartile.');
    check(forecast.highestExpectedHour.upperPrediction < busyHourlyThreshold,
      'Hourly upper prediction is below the busy threshold.', 'Hourly upper prediction crosses the busy threshold.');
    check(forecast.averageWaitMinutes === null || forecast.averageWaitMinutes <= MAX_AVERAGE_WAIT_MINUTES,
      'Average wait is at most 45 minutes.', 'Average wait exceeds 45 minutes.');
    check(volatility <= 1,
      'Prediction volatility is within the safety limit.', 'Prediction volatility is too high.');
    check(backupMissRate <= MAX_BACKUP_MISS_RATE,
      'Backup doctor coverage is complete.', 'Backup doctor coverage is incomplete.');

    return {
      status: reasons.length === 0 ? 'suggested' as const : 'rejected' as const,
      weekday: forecast.weekday,
      forecast,
      safetyScore: null,
      reasons,
      passedChecks,
      components: {
        predictedDailyAttendance: forecast.expectedTotal,
        dailyUpperPrediction: forecast.upperPrediction,
        highestPredictedHour: forecast.highestExpectedHour.expectedVisits,
        observedPeakPercentile: observedPeakPercentile(forecast.highestObservedPeak, observedWeekdayPeaks),
        waitingRisk: forecast.averageWaitMinutes ?? 0,
        volatility,
        backupRisk: backupMissRate,
      },
    };
  });
  const suggestions = assessments.filter(item => item.status === 'suggested');
  const componentNames = [
    'predictedDailyAttendance', 'dailyUpperPrediction', 'highestPredictedHour',
    'observedPeakPercentile', 'waitingRisk', 'volatility', 'backupRisk',
  ] as const;
  const normalizedComponents = Object.fromEntries(componentNames.map(name => [
    name,
    normalizeAcrossEligible(suggestions.map(item => item.components[name])),
  ])) as Record<typeof componentNames[number], number[]>;
  suggestions.forEach((suggestion, index) => {
    suggestion.safetyScore = (0.30 * normalizedComponents.predictedDailyAttendance[index])
      + (0.25 * normalizedComponents.dailyUpperPrediction[index])
      + (0.15 * normalizedComponents.highestPredictedHour[index])
      + (0.10 * normalizedComponents.observedPeakPercentile[index])
      + (0.10 * normalizedComponents.waitingRisk[index])
      + (0.05 * normalizedComponents.volatility[index])
      + (0.05 * normalizedComponents.backupRisk[index]);
  });

  return assessments
    .map(({ components: _components, ...assessment }) => assessment)
    .sort((left, right) => {
      if (left.status === 'suggested' && right.status !== 'suggested') return -1;
      if (left.status !== 'suggested' && right.status === 'suggested') return 1;
      if (left.status === 'suggested' && right.status === 'suggested') {
        return (left.safetyScore ?? Infinity) - (right.safetyScore ?? Infinity) || (left.weekday ?? Infinity) - (right.weekday ?? Infinity);
      }
      return (left.weekday ?? Infinity) - (right.weekday ?? Infinity);
    });
}

export function buildAttendanceRecommendations(
  cells: AttendanceHeatmapCell[],
  selectedDoctorId?: string | null,
): AttendanceRecommendations {
  const candidates = cells.filter(eligible);
  const quietThreshold = candidates.length === 0 ? null : percentile(candidates.map(cell => cell.averageVisits as number), 0.25);
  const busyThreshold = candidates.length === 0 ? null : percentile(candidates.map(cell => cell.averageVisits as number), 0.75);
  const safeQuiet = candidates.filter(cell => quietThreshold !== null
    && (cell.averageVisits as number) <= quietThreshold
    && (cell.averageWaitMinutes === null || cell.averageWaitMinutes <= 45)
    && (cell.peakVisits === null || cell.peakVisits <= Math.max(2, (cell.averageVisits as number) * 2)));

  const trainingWindows: AttendanceRecommendations['trainingWindows'] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    const day = safeQuiet.filter(cell => cell.weekday === weekday).sort((left, right) => left.hour - right.hour);
    for (let index = 0; index < day.length - 1;) {
      const start = index;
      while (index + 1 < day.length && day[index + 1].hour === day[index].hour + 1) index += 1;
      if (index - start + 1 >= 2) {
        const run = day.slice(start, index + 1);
        const peakVisits = Math.max(...run.map(cell => cell.peakVisits ?? 0));
        trainingWindows.push({
          ...recommendation(run[0]),
          startHour: run[0].hour,
          endHour: run.at(-1)!.hour + 1,
          sampleSize: run.reduce((total, cell) => total + cell.operatingOccurrences, 0),
          evidence: { ...evidence(run[0]), peakVisits },
        });
      }
      index += 1;
    }
  }

  void selectedDoctorId;

  return {
    trainingWindows,
    possibleDoctorOffDays: [],
    peakStaffing: candidates.filter(cell => (busyThreshold !== null && (cell.averageVisits as number) >= busyThreshold)
      || (cell.averageWaitMinutes !== null && cell.averageWaitMinutes > 45)).map(recommendation),
    unstablePeaks: candidates.filter(cell => cell.peakVisits !== null && cell.medianVisits !== null
      && cell.peakVisits >= Math.max(cell.medianVisits, cell.averageVisits as number) * 2
      && cell.peakVisits - Math.max(cell.medianVisits, cell.averageVisits as number) >= 2).map(recommendation),
  };
}
