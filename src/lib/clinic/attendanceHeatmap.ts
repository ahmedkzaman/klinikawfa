export type AttendanceHeatmapCell = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  totalVisits: number;
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

export type AttendanceRecommendations = {
  trainingWindows: Array<AttendanceRecommendation & { startHour: number; endHour: number }>;
  possibleDoctorOffDays: AttendanceRecommendation[];
  peakStaffing: AttendanceRecommendation[];
  unstablePeaks: AttendanceRecommendation[];
};

const MINIMUM_COMPARABLE_OCCURRENCES = 8;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valueOf(source: Record<string, unknown>, camelCase: string): unknown {
  const snakeCase = camelCase.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  return source[camelCase] ?? source[snakeCase];
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
  const operatingOccurrences = requiredNonNegativeNumber(valueOf(source, 'operatingOccurrences'));
  const waitMeasuredVisits = requiredNonNegativeNumber(valueOf(source, 'waitMeasuredVisits'));
  const otherDoctorCoveredOccurrences = requiredNonNegativeNumber(valueOf(source, 'otherDoctorCoveredOccurrences'));
  if (totalVisits === null || operatingOccurrences === null || waitMeasuredVisits === null || otherDoctorCoveredOccurrences === null) return null;
  const rawDates = valueOf(source, 'dates');

  return {
    weekday: weekday as AttendanceHeatmapCell['weekday'],
    hour,
    totalVisits,
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

export function normalizeAttendanceHeatmapReport(raw: unknown): AttendanceHeatmapReport {
  const source = object(raw) ?? {};
  const rawCells = valueOf(source, 'cells');
  const rawDoctors = valueOf(source, 'doctors');
  const rawWarnings = valueOf(source, 'warnings');
  const cells = Array.isArray(rawCells) ? rawCells.flatMap(cell => {
    const normalized = normalizeCell(cell);
    return normalized ? [normalized] : [];
  }) : [];
  return {
    period: periodFrom(source),
    cells,
    hasAttendanceData: cells.some((cell) => cell.totalVisits > 0 || cell.operatingOccurrences > 0),
    doctors: Array.isArray(rawDoctors) ? rawDoctors.flatMap(doctor => {
      const value = object(doctor);
      return value && typeof value.id === 'string' && typeof value.name === 'string' ? [{ id: value.id, name: value.name }] : [];
    }) : [],
    warnings: Array.isArray(rawWarnings) ? rawWarnings.filter((warning): warning is string => typeof warning === 'string') : [],
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

  return {
    trainingWindows,
    possibleDoctorOffDays: selectedDoctorId
      ? candidates.filter(cell => cell.averageVisits === 0 && cell.otherDoctorCoveredOccurrences >= MINIMUM_COMPARABLE_OCCURRENCES).map(recommendation)
      : [],
    peakStaffing: candidates.filter(cell => (busyThreshold !== null && (cell.averageVisits as number) >= busyThreshold)
      || (cell.averageWaitMinutes !== null && cell.averageWaitMinutes > 45)).map(recommendation),
    unstablePeaks: candidates.filter(cell => cell.peakVisits !== null && cell.medianVisits !== null
      && cell.peakVisits >= Math.max(cell.medianVisits, cell.averageVisits as number) * 2
      && cell.peakVisits - Math.max(cell.medianVisits, cell.averageVisits as number) >= 2).map(recommendation),
  };
}
