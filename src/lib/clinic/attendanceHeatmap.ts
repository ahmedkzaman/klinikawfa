import type { AttendanceRegressionObservation } from './attendanceRegression';

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

export type AttendanceRecommendations = {
  trainingWindows: Array<AttendanceRecommendation & { startHour: number; endHour: number }>;
  possibleDoctorOffDays: AttendanceOffDayRecommendation[];
  peakStaffing: AttendanceRecommendation[];
  unstablePeaks: AttendanceRecommendation[];
};

const MINIMUM_COMPARABLE_OCCURRENCES = 8;
const MAXIMUM_MODEL_OBSERVATIONS = 52 * 7 * 16;

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

  const weekdayCandidates = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((weekday) => {
    const rosterBackedDay = cells.filter((cell) => cell.weekday === weekday && cell.operatingOccurrences > 0);
    if (rosterBackedDay.length === 0 || rosterBackedDay.some((cell) => !eligible(cell))) return [];
    const day = rosterBackedDay;
    const averageVisits = day.reduce((sum, cell) => sum + (cell.averageVisits as number), 0);
    const medianVisits = day.every((cell) => cell.medianVisits !== null)
      ? day.reduce((sum, cell) => sum + (cell.medianVisits as number), 0)
      : null;
    const peakVisits = day.reduce<number | null>((peak, cell) => cell.peakVisits === null
      ? peak
      : Math.max(peak ?? cell.peakVisits, cell.peakVisits), null);
    const waitMeasuredVisits = day.reduce((sum, cell) => sum + cell.waitMeasuredVisits, 0);
    const averageWaitMinutes = waitMeasuredVisits === 0
      ? null
      : day.reduce((sum, cell) => sum + (cell.averageWaitMinutes ?? 0) * cell.waitMeasuredVisits, 0) / waitMeasuredVisits;
    return [{
      weekday,
      averageVisits,
      busiestHourAverage: Math.max(...day.map((cell) => cell.averageVisits as number)),
      sampleSize: Math.min(...day.map((cell) => cell.operatingOccurrences)),
      fullySupported: day.every((cell) => cell.otherDoctorCoveredOccurrences >= cell.operatingOccurrences),
      evidence: {
        averageVisits,
        medianVisits,
        peakVisits,
        averageWaitMinutes,
        otherDoctorCoveredOccurrences: Math.min(...day.map((cell) => cell.otherDoctorCoveredOccurrences)),
      },
    }];
  });
  const lowestWeekdayAverage = weekdayCandidates.length === 0
    ? null
    : Math.min(...weekdayCandidates.map((day) => day.averageVisits));
  const possibleDoctorOffDays = weekdayCandidates
    .filter((day) => day.averageVisits === lowestWeekdayAverage)
    .filter((day) => busyThreshold !== null && day.busiestHourAverage < busyThreshold)
    .filter((day) => !selectedDoctorId || day.fullySupported)
    .map(({ weekday, sampleSize, evidence: dayEvidence }) => ({ weekday, sampleSize, evidence: dayEvidence }));

  return {
    trainingWindows,
    possibleDoctorOffDays,
    peakStaffing: candidates.filter(cell => (busyThreshold !== null && (cell.averageVisits as number) >= busyThreshold)
      || (cell.averageWaitMinutes !== null && cell.averageWaitMinutes > 45)).map(recommendation),
    unstablePeaks: candidates.filter(cell => cell.peakVisits !== null && cell.medianVisits !== null
      && cell.peakVisits >= Math.max(cell.medianVisits, cell.averageVisits as number) * 2
      && cell.peakVisits - Math.max(cell.medianVisits, cell.averageVisits as number) >= 2).map(recommendation),
  };
}
