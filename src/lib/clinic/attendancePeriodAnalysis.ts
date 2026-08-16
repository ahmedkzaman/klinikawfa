import type { AttendanceHeatmapCell, DoctorOffDayAssessment } from './attendanceHeatmap';
import type {
  AttendanceHourlyForecast,
  AttendanceRegressionResult,
} from './attendanceRegression';

export const ATTENDANCE_PERIODS = [
  { id: 'morning', label: '8am–12pm', startHour: 8, endHour: 12 },
  { id: 'afternoon', label: '12pm–4pm', startHour: 12, endHour: 16 },
  { id: 'evening', label: '4pm–8pm', startHour: 16, endHour: 20 },
  { id: 'night', label: '8pm–12 midnight', startHour: 20, endHour: 24 },
] as const;

export type AttendancePeriodId = typeof ATTENDANCE_PERIODS[number]['id'];
export type AttendanceConfidence = 'high' | 'moderate' | 'insufficient';
export type AttendanceTrafficLevel = 'low' | 'moderate' | 'high' | 'unavailable';
type Weekday = AttendanceHeatmapCell['weekday'];

export type AttendancePeriodSummary = {
  weekday: Weekday;
  periodId: AttendancePeriodId;
  label: string;
  startHour: number;
  endHour: number;
  status: 'ready' | 'closed' | 'uncovered' | 'insufficient' | 'unavailable';
  expectedVisits: number | null;
  lowerPrediction: number | null;
  upperPrediction: number | null;
  trafficLevel: AttendanceTrafficLevel;
  confidence: AttendanceConfidence;
  safeForTraining: boolean;
  safetyReasons: string[];
  hourly: Array<{ forecast: AttendanceHourlyForecast; cell: AttendanceHeatmapCell | null }>;
};

export type AttendanceDecision = {
  status: 'ready' | 'none' | 'unavailable';
  title: string;
  weekday: Weekday | null;
  periodId: AttendancePeriodId | null;
  expectedVisits: number | null;
  lowerPrediction: number | null;
  upperPrediction: number | null;
  confidence: AttendanceConfidence;
  reason: string;
};

export type AttendanceDecisionSummary = {
  offDay: AttendanceDecision;
  training: AttendanceDecision;
  peak: AttendanceDecision;
};

export type AttendancePeriodAnalysis = {
  periods: AttendancePeriodSummary[];
  decisions: AttendanceDecisionSummary;
};

type Input = {
  regression: AttendanceRegressionResult;
  cells: AttendanceHeatmapCell[];
  offDayAssessments: DoctorOffDayAssessment[];
  selectedDoctorId: string | null;
};

const MINIMUM_COMPARABLE_OCCURRENCES = 8;
const MAX_AVERAGE_WAIT_MINUTES = 45;

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function confidence(
  regression: Extract<AttendanceRegressionResult, { status: 'ready' }>,
  hourly: Array<{ forecast: AttendanceHourlyForecast; cell: AttendanceHeatmapCell | null }>,
): AttendanceConfidence {
  if (hourly.length !== 4 || hourly.some(({ cell }) => cell === null || cell.coverage !== 'complete')) return 'insufficient';
  const sufficientSamples = hourly.every(({ cell }) => (cell?.operatingOccurrences ?? 0) >= 12);
  const bounds = hourly.reduce((total, { forecast }) => total + forecast.upperPrediction - forecast.lowerPrediction, 0);
  const expected = hourly.reduce((total, { forecast }) => total + forecast.expectedVisits, 0);
  if (regression.diagnostics.usableWeeks >= 24 && sufficientSamples && bounds / Math.max(expected, 1) <= 1) return 'high';
  return 'moderate';
}

function defaultDecision(title: string, status: AttendanceDecision['status'], reason: string): AttendanceDecision {
  return {
    status,
    title,
    weekday: null,
    periodId: null,
    expectedVisits: null,
    lowerPrediction: null,
    upperPrediction: null,
    confidence: status === 'unavailable' ? 'insufficient' : 'moderate',
    reason,
  };
}

function emptyDecisions(regression: AttendanceRegressionResult): AttendanceDecisionSummary {
  const status = regression.status === 'ready' ? 'none' : 'unavailable';
  const reason = regression.status === 'ready'
    ? 'No safe regression-qualified period is available for this range.'
    : 'Regression recommendations are unavailable; descriptive attendance remains available.';
  return {
    offDay: defaultDecision('Possible doctor off-day', status, reason),
    training: defaultDecision('Best training window', status, reason),
    peak: defaultDecision('Peak staffing period', status, reason),
  };
}

export function buildAttendancePeriodAnalysis(input: Input): AttendancePeriodAnalysis {
  const { regression, cells, selectedDoctorId } = input;
  const cellByKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const hourlyByKey = new Map(regression.status === 'ready'
    ? regression.hourly.map((forecast) => [`${forecast.weekday}-${forecast.hour}`, forecast])
    : []);
  const allHourly = regression.status === 'ready' ? regression.hourly : [];
  const busyExpectedThreshold = percentile(allHourly.map((forecast) => forecast.expectedVisits), 0.75);
  const observedPeaks = cells.flatMap((cell) => cell.peakVisits === null ? [] : [cell.peakVisits]);
  const busyObservedThreshold = percentile(observedPeaks, 0.75);

  const periods: AttendancePeriodSummary[] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    for (const period of ATTENDANCE_PERIODS) {
      const hourly = Array.from({ length: period.endHour - period.startHour }, (_, offset) => {
        const hour = period.startHour + offset;
        const forecast = hourlyByKey.get(`${weekday}-${hour}`);
        return forecast ? { forecast, cell: cellByKey.get(`${weekday}-${hour}`) ?? null } : null;
      });
      const safetyReasons: string[] = [];
      let status: AttendancePeriodSummary['status'] = 'ready';
      if (regression.status !== 'ready' || hourly.some((item) => item === null)) {
        status = 'unavailable';
        safetyReasons.push('Regression forecast is unavailable for one or more hours.');
      } else {
        const entries = hourly as Array<{ forecast: AttendanceHourlyForecast; cell: AttendanceHeatmapCell | null }>;
        if (entries.some(({ cell }) => cell === null || cell.coverage === 'uncovered')) {
          status = 'uncovered';
          safetyReasons.push('Roster coverage is incomplete for one or more hours.');
        } else if (entries.some(({ cell }) => cell === null || cell.coverage !== 'complete' || cell.operatingOccurrences < MINIMUM_COMPARABLE_OCCURRENCES)) {
          status = 'insufficient';
          safetyReasons.push('Fewer than 8 comparable operating dates are available for one or more hours.');
        }
        if (entries.some(({ cell }) => cell?.averageWaitMinutes !== null && cell.averageWaitMinutes > MAX_AVERAGE_WAIT_MINUTES)) {
          safetyReasons.push('Average wait exceeds 45 minutes.');
        }
        if (busyExpectedThreshold !== null && entries.some(({ forecast }) => forecast.upperPrediction >= busyExpectedThreshold)) {
          safetyReasons.push('Hourly upper prediction crosses the busy threshold.');
        }
        if (busyObservedThreshold !== null && entries.some(({ cell }) => cell?.peakVisits !== null && cell.peakVisits >= busyObservedThreshold)) {
          safetyReasons.push('Observed peak is in the busiest hourly quartile.');
        }
        if (selectedDoctorId && entries.some(({ cell }) => cell === null || cell.otherDoctorCoveredOccurrences < cell.operatingOccurrences)) {
          safetyReasons.push('Backup doctor coverage is incomplete.');
        }
      }
      const readyEntries = hourly.filter((item): item is { forecast: AttendanceHourlyForecast; cell: AttendanceHeatmapCell | null } => item !== null);
      const expectedVisits = readyEntries.length === 4 ? readyEntries.reduce((total, item) => total + item.forecast.expectedVisits, 0) : null;
      const lowerPrediction = readyEntries.length === 4 ? readyEntries.reduce((total, item) => total + item.forecast.lowerPrediction, 0) : null;
      const upperPrediction = readyEntries.length === 4 ? readyEntries.reduce((total, item) => total + item.forecast.upperPrediction, 0) : null;
      periods.push({
        weekday,
        periodId: period.id,
        label: period.label,
        startHour: period.startHour,
        endHour: period.endHour,
        status,
        expectedVisits,
        lowerPrediction,
        upperPrediction,
        trafficLevel: 'unavailable',
        confidence: regression.status === 'ready' ? confidence(regression, readyEntries) : 'insufficient',
        safeForTraining: status === 'ready' && safetyReasons.length === 0,
        safetyReasons: [...new Set(safetyReasons)],
        hourly: readyEntries,
      });
    }
  }

  const readyPeriods = periods.filter((period) => period.status === 'ready' && period.expectedVisits !== null);
  const lowThreshold = percentile(readyPeriods.map((period) => period.expectedVisits as number), 0.25);
  const highThreshold = percentile(readyPeriods.map((period) => period.expectedVisits as number), 0.75);
  periods.forEach((period) => {
    if (period.expectedVisits === null) return;
    period.trafficLevel = highThreshold !== null && period.expectedVisits >= highThreshold
      ? 'high'
      : lowThreshold !== null && period.expectedVisits <= lowThreshold ? 'low' : 'moderate';
  });

  const decisions = emptyDecisions(regression);
  if (regression.status === 'ready') {
    const training = periods
      .filter((period) => period.safeForTraining && period.expectedVisits !== null)
      .sort((left, right) => left.expectedVisits! - right.expectedVisits! || left.weekday - right.weekday || left.startHour - right.startHour)[0];
    if (training) {
      decisions.training = {
        status: 'ready', title: 'Best training window', weekday: training.weekday, periodId: training.periodId,
        expectedVisits: training.expectedVisits, lowerPrediction: training.lowerPrediction, upperPrediction: training.upperPrediction,
        confidence: training.confidence, reason: 'Lowest regression-predicted period that passed every hourly safety check.',
      };
    }
    const peak = periods.filter((period) => period.expectedVisits !== null)
      .sort((left, right) => right.expectedVisits! - left.expectedVisits! || left.weekday - right.weekday || left.startHour - right.startHour)[0];
    if (peak) {
      decisions.peak = {
        status: 'ready', title: 'Peak staffing period', weekday: peak.weekday, periodId: peak.periodId,
        expectedVisits: peak.expectedVisits, lowerPrediction: peak.lowerPrediction, upperPrediction: peak.upperPrediction,
        confidence: peak.confidence, reason: 'Highest regression-predicted attendance period in the selected range.',
      };
    }
    const offDay = input.offDayAssessments.find((assessment) => assessment.status === 'suggested' && assessment.forecast !== null);
    if (offDay?.forecast) {
      const period = periods.find((item) => item.weekday === offDay.forecast!.weekday && item.expectedVisits !== null);
      decisions.offDay = {
        status: 'ready', title: 'Possible doctor off-day', weekday: offDay.forecast.weekday, periodId: null,
        expectedVisits: offDay.forecast.expectedTotal, lowerPrediction: offDay.forecast.lowerPrediction, upperPrediction: offDay.forecast.upperPrediction,
        confidence: period?.confidence ?? 'moderate', reason: 'Lowest safety-score weekday that passed the regression off-day checks.',
      };
    }
  }

  return { periods, decisions };
}
