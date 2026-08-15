export type AttendanceRegressionObservation = {
  date: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  visits: number;
  averageWaitMinutes: number | null;
  waitMeasuredVisits: number;
  doctorsRostered: number;
  selectedDoctorScheduled: boolean;
  backupDoctorCovered: boolean;
};

export type AttendanceModelDiagnostics = {
  family: 'negative_binomial' | 'poisson';
  converged: boolean;
  iterations: number;
  usableWeeks: number;
  observationCount: number;
  dispersion: number;
  warnings: string[];
};

export type AttendanceHourlyForecast = {
  weekday: AttendanceRegressionObservation['weekday'];
  hour: number;
  expectedVisits: number;
  lowerPrediction: number;
  upperPrediction: number;
};

export type AttendanceWeekdayForecast = {
  weekday: AttendanceRegressionObservation['weekday'];
  expectedTotal: number;
  lowerPrediction: number;
  upperPrediction: number;
  highestExpectedHour: AttendanceHourlyForecast;
  highestObservedPeak: number;
  averageWaitMinutes: number | null;
  comparableDates: number;
  backupCoverageRate: number;
};

export type AttendanceRegressionResult =
  | { status: 'ready'; diagnostics: AttendanceModelDiagnostics; hourly: AttendanceHourlyForecast[]; weekdays: AttendanceWeekdayForecast[] }
  | { status: 'unavailable'; diagnostics: AttendanceModelDiagnostics; reasons: string[] };

const MIN_USABLE_WEEKS = 12;
const MAX_ITERATIONS = 50;
const CONVERGENCE_TOLERANCE = 1e-7;
const RIDGE = 1e-6;

function safeExp(value: number): number {
  return Math.exp(Math.max(-20, Math.min(20, value)));
}

type DesignMatrix = {
  featureNames: string[];
  values: number[][];
  responses: number[];
  observations: AttendanceRegressionObservation[];
};

type Fit = { coefficients: number[]; iterations: number };
type ForecastRow = AttendanceHourlyForecast & { variance: number; observations: AttendanceRegressionObservation[] };

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function weekdayFromDate(value: string): number {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function weekKey(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  const offsetToMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offsetToMonday);
  return date.toISOString().slice(0, 10);
}

function validObservation(observation: AttendanceRegressionObservation): boolean {
  return isDate(observation.date)
    && observation.weekday === weekdayFromDate(observation.date)
    && Number.isInteger(observation.weekday)
    && observation.weekday >= 1
    && observation.weekday <= 7
    && Number.isInteger(observation.hour)
    && observation.hour >= 0
    && observation.hour <= 23
    && Number.isFinite(observation.visits)
    && observation.visits >= 0
    && Number.isFinite(observation.waitMeasuredVisits)
    && observation.waitMeasuredVisits >= 0
    && Number.isFinite(observation.doctorsRostered)
    && observation.doctorsRostered > 0
    && (observation.averageWaitMinutes === null || (Number.isFinite(observation.averageWaitMinutes) && observation.averageWaitMinutes >= 0))
    && typeof observation.selectedDoctorScheduled === 'boolean'
    && typeof observation.backupDoctorCovered === 'boolean';
}

function featureNames(observations: AttendanceRegressionObservation[]): string[] {
  const weekdays = new Set(observations.map(observation => observation.weekday));
  const hours = new Set(observations.map(observation => observation.hour));
  const months = new Set(observations.map(observation => Number(observation.date.slice(5, 7))));
  const monthReference = Math.min(...months);
  return [
    'intercept',
    ...[2, 3, 4, 5, 6, 7].filter(weekday => weekdays.has(weekday as AttendanceRegressionObservation['weekday'])).map(weekday => `weekday_${weekday}`),
    ...Array.from(hours).filter(hour => hour !== 8).sort((left, right) => left - right).map(hour => `hour_${hour}`),
    ...Array.from(months).filter(month => month !== monthReference).sort((left, right) => left - right).map(month => `month_${month}`),
    'week_trend',
    'doctors_rostered',
    'selected_doctor_scheduled',
    'backup_doctor_covered',
  ];
}

function buildAttendanceDesignMatrix(observations: AttendanceRegressionObservation[]): DesignMatrix {
  const weeks = [...new Set(observations.map(observation => weekKey(observation.date)))].sort();
  const weekIndexes = new Map(weeks.map((week, index) => [week, index - ((weeks.length - 1) / 2)]));
  const names = featureNames(observations);
  return {
    featureNames: names,
    values: observations.map(observation => {
      const month = Number(observation.date.slice(5, 7));
      return names.map(name => {
        if (name === 'intercept') return 1;
        if (name === 'week_trend') return weekIndexes.get(weekKey(observation.date)) ?? 0;
        if (name === 'doctors_rostered') return observation.doctorsRostered;
        if (name === 'selected_doctor_scheduled') return Number(observation.selectedDoctorScheduled);
        if (name === 'backup_doctor_covered') return Number(observation.backupDoctorCovered);
        if (name.startsWith('weekday_')) return Number(observation.weekday === Number(name.slice('weekday_'.length)));
        if (name.startsWith('hour_')) return Number(observation.hour === Number(name.slice('hour_'.length)));
        return Number(month === Number(name.slice('month_'.length)));
      });
    }),
    responses: observations.map(observation => observation.visits),
    observations,
  };
}

function hasFullColumnRank(values: number[][]): boolean {
  if (values.length === 0 || values.length < values[0].length) return false;
  const reduced = values.map(row => [...row]);
  const maximum = Math.max(...reduced.flat().map(Math.abs));
  const tolerance = Math.max(1, maximum) * 1e-10;
  const columns = reduced[0].length;
  let pivotRow = 0;
  for (let column = 0; column < columns; column += 1) {
    let pivot = pivotRow;
    for (let row = pivotRow + 1; row < reduced.length; row += 1) {
      if (Math.abs(reduced[row][column]) > Math.abs(reduced[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(reduced[pivot][column]) || Math.abs(reduced[pivot][column]) <= tolerance) return false;
    [reduced[pivotRow], reduced[pivot]] = [reduced[pivot], reduced[pivotRow]];
    const divisor = reduced[pivotRow][column];
    for (let entry = column; entry < columns; entry += 1) reduced[pivotRow][entry] /= divisor;
    for (let row = pivotRow + 1; row < reduced.length; row += 1) {
      const scale = reduced[row][column];
      for (let entry = column; entry < columns; entry += 1) reduced[row][entry] -= scale * reduced[pivotRow][entry];
    }
    pivotRow += 1;
  }
  return true;
}

function solvePivoted(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(augmented[pivot][column]) || Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const scale = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) augmented[row][entry] -= scale * augmented[column][entry];
    }
  }
  const answer = augmented.map(row => row[size]);
  return answer.every(Number.isFinite) ? answer : null;
}

function normalEquation(matrix: DesignMatrix, weights: number[], workingResponse: number[]): number[][] | null {
  const columns = matrix.featureNames.length;
  const equation = Array.from({ length: columns }, () => Array(columns + 1).fill(0));
  for (let row = 0; row < matrix.values.length; row += 1) {
    const weight = weights[row];
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(workingResponse[row])) return null;
    for (let left = 0; left < columns; left += 1) {
      const leftValue = matrix.values[row][left];
      equation[left][columns] += weight * leftValue * workingResponse[row];
      for (let right = 0; right < columns; right += 1) equation[left][right] += weight * leftValue * matrix.values[row][right];
    }
  }
  for (let index = 0; index < columns; index += 1) equation[index][index] += RIDGE;
  return equation.every(row => row.every(Number.isFinite)) ? equation : null;
}

function fitIrls(matrix: DesignMatrix, alpha: number): Fit | null {
  if (matrix.responses.every(value => value === 0)) return null;
  const initialMean = matrix.responses.reduce((total, value) => total + value, 0) / matrix.responses.length;
  let coefficients = Array(matrix.featureNames.length).fill(0);
  coefficients[0] = Math.log(Math.max(initialMean, 1e-6));
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const means = matrix.values.map(row => safeExp(row.reduce((total, value, index) => total + (value * coefficients[index]), 0)));
    const weights = means.map(mean => mean / (1 + (alpha * mean)));
    const workingResponse = matrix.values.map((row, index) => {
      const eta = row.reduce((total, value, column) => total + (value * coefficients[column]), 0);
      return eta + ((matrix.responses[index] - means[index]) / means[index]);
    });
    const equation = normalEquation(matrix, weights, workingResponse);
    if (!equation) return null;
    const next = solvePivoted(equation.map(row => row.slice(0, -1)), equation.map(row => row.at(-1)!));
    if (!next) return null;
    const difference = Math.max(...next.map((value, index) => Math.abs(value - coefficients[index])));
    coefficients = next;
    if (!Number.isFinite(difference)) return null;
    if (difference < CONVERGENCE_TOLERANCE) return { coefficients, iterations: iteration };
  }
  return null;
}

function pearsonDispersion(matrix: DesignMatrix, coefficients: number[]): number {
  const means = matrix.values.map(row => safeExp(row.reduce((total, value, index) => total + (value * coefficients[index]), 0)));
  const degreesOfFreedom = Math.max(1, matrix.responses.length - matrix.featureNames.length);
  const pearson = matrix.responses.reduce((total, response, index) => total + (((response - means[index]) ** 2) / means[index]), 0) / degreesOfFreedom;
  const mean = means.reduce((total, value) => total + value, 0) / means.length;
  return Number.isFinite(pearson) && Number.isFinite(mean) && mean > 0 ? Math.max(0, (pearson - 1) / mean) : Number.NaN;
}

function prediction(row: number[], coefficients: number[], alpha: number): { mean: number; variance: number } {
  const mean = safeExp(row.reduce((total, value, index) => total + (value * coefficients[index]), 0));
  return { mean, variance: mean + (alpha * mean * mean) };
}

function predictionBounds(mean: number, variance: number): Pick<AttendanceHourlyForecast, 'lowerPrediction' | 'upperPrediction'> {
  const spread = 1.96 * Math.sqrt(Math.max(0, variance));
  return { lowerPrediction: Math.max(0, mean - spread), upperPrediction: Math.max(0, mean + spread) };
}

function finitePredictionBounds(forecast: Pick<AttendanceHourlyForecast, 'lowerPrediction' | 'upperPrediction'>): boolean {
  return Number.isFinite(forecast.lowerPrediction)
    && Number.isFinite(forecast.upperPrediction)
    && forecast.lowerPrediction >= 0
    && forecast.upperPrediction >= 0;
}

function finiteForecast(forecast: Pick<AttendanceHourlyForecast, 'expectedVisits' | 'lowerPrediction' | 'upperPrediction'>): boolean {
  return Number.isFinite(forecast.expectedVisits)
    && forecast.expectedVisits >= 0
    && finitePredictionBounds(forecast);
}

function makeForecasts(matrix: DesignMatrix, coefficients: number[], alpha: number): { hourly: AttendanceHourlyForecast[]; weekdays: AttendanceWeekdayForecast[] } | null {
  const groups = new Map<string, number[]>();
  matrix.observations.forEach((observation, index) => {
    const key = `${observation.weekday}:${observation.hour}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const hourlyRows: ForecastRow[] = [...groups.values()].map(indexes => {
    const first = matrix.observations[indexes[0]];
    const estimates = indexes.map(index => prediction(matrix.values[index], coefficients, alpha));
    const expectedVisits = estimates.reduce((total, estimate) => total + estimate.mean, 0) / estimates.length;
    const variance = estimates.reduce((total, estimate) => total + estimate.variance + ((estimate.mean - expectedVisits) ** 2), 0) / estimates.length;
    return { weekday: first.weekday, hour: first.hour, expectedVisits, ...predictionBounds(expectedVisits, variance), variance, observations: indexes.map(index => matrix.observations[index]) };
  }).sort((left, right) => left.weekday - right.weekday || left.hour - right.hour);
  if (hourlyRows.some(row => !finiteForecast(row) || !Number.isFinite(row.variance) || row.variance < 0)) return null;

  const weekdays = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap(weekday => {
    const dayHours = hourlyRows.filter(hour => hour.weekday === weekday);
    if (dayHours.length === 0) return [];
    const expectedTotal = dayHours.reduce((total, hour) => total + hour.expectedVisits, 0);
    const variance = dayHours.reduce((total, hour) => total + hour.variance, 0);
    const observations = dayHours.flatMap(hour => hour.observations);
    const waitMeasuredVisits = observations.reduce((total, observation) => total + observation.waitMeasuredVisits, 0);
    const weightedWait = observations.reduce((total, observation) => total + ((observation.averageWaitMinutes ?? 0) * observation.waitMeasuredVisits), 0);
    const highestExpectedHour = [...dayHours].sort((left, right) => right.expectedVisits - left.expectedVisits || left.hour - right.hour)[0];
    return [{
      weekday,
      expectedTotal,
      ...predictionBounds(expectedTotal, variance),
      highestExpectedHour: {
        weekday: highestExpectedHour.weekday,
        hour: highestExpectedHour.hour,
        expectedVisits: highestExpectedHour.expectedVisits,
        lowerPrediction: highestExpectedHour.lowerPrediction,
        upperPrediction: highestExpectedHour.upperPrediction,
      },
      highestObservedPeak: Math.max(...observations.map(observation => observation.visits)),
      averageWaitMinutes: waitMeasuredVisits === 0 ? null : weightedWait / waitMeasuredVisits,
      comparableDates: new Set(observations.map(observation => observation.date)).size,
      backupCoverageRate: observations.filter(observation => observation.backupDoctorCovered).length / observations.length,
    }];
  });
  if (weekdays.some(day => !Number.isFinite(day.expectedTotal) || day.expectedTotal < 0 || !finitePredictionBounds(day) || !finiteForecast(day.highestExpectedHour))) return null;
  return { hourly: hourlyRows.map(({ variance: _variance, observations: _observations, ...hour }) => hour), weekdays };
}

function diagnostics(overrides: Partial<AttendanceModelDiagnostics> = {}): AttendanceModelDiagnostics {
  return {
    family: 'poisson',
    converged: false,
    iterations: 0,
    usableWeeks: 0,
    observationCount: 0,
    dispersion: 0,
    warnings: [],
    ...overrides,
  };
}

export function fitAttendanceRegression(
  observations: AttendanceRegressionObservation[],
  selectedDoctorId?: string | null,
): AttendanceRegressionResult {
  void selectedDoctorId;
  const usable = observations.filter(validObservation);
  const usableWeeks = new Set(usable.map(observation => weekKey(observation.date))).size;
  const warnings = observations.length === usable.length ? [] : ['Uncovered or invalid observations were excluded.'];
  const baseDiagnostics = diagnostics({ usableWeeks, observationCount: usable.length, warnings });
  const reasons: string[] = [];
  if (usable.length !== observations.length) reasons.push('All observations must be covered and finite.');
  if (usable.length === 0) reasons.push('No covered, valid observations are available.');
  if (usableWeeks < MIN_USABLE_WEEKS) reasons.push('At least 12 usable weeks are required.');
  if (reasons.length > 0) return { status: 'unavailable', diagnostics: baseDiagnostics, reasons };

  const matrix = buildAttendanceDesignMatrix(usable);
  if (!hasFullColumnRank(matrix.values)) return {
    status: 'unavailable',
    diagnostics: baseDiagnostics,
    reasons: ['The design matrix is structurally unidentifiable.'],
  };
  const poissonFit = fitIrls(matrix, 0);
  if (!poissonFit) return { status: 'unavailable', diagnostics: baseDiagnostics, reasons: ['The Poisson fit did not converge.'] };
  const estimatedDispersion = pearsonDispersion(matrix, poissonFit.coefficients);
  if (!Number.isFinite(estimatedDispersion)) return { status: 'unavailable', diagnostics: baseDiagnostics, reasons: ['The dispersion estimate was not finite.'] };
  const family = estimatedDispersion <= 0.01 ? 'poisson' : 'negative_binomial';
  const fit = family === 'poisson' ? poissonFit : fitIrls(matrix, estimatedDispersion);
  if (!fit) return {
    status: 'unavailable',
    diagnostics: diagnostics({ ...baseDiagnostics, family, dispersion: estimatedDispersion }),
    reasons: [`The ${family === 'poisson' ? 'Poisson' : 'negative binomial'} fit did not converge.`],
  };
  const forecasts = makeForecasts(matrix, fit.coefficients, estimatedDispersion);
  if (!forecasts) return {
    status: 'unavailable',
    diagnostics: diagnostics({ ...baseDiagnostics, family, converged: true, iterations: fit.iterations, dispersion: estimatedDispersion }),
    reasons: ['The fitted predictions were not finite.'],
  };
  return {
    status: 'ready',
    diagnostics: diagnostics({
      ...baseDiagnostics,
      family,
      converged: true,
      iterations: fit.iterations,
      dispersion: estimatedDispersion,
    }),
    ...forecasts,
  };
}

export const __attendanceRegressionTestables = { buildAttendanceDesignMatrix };
