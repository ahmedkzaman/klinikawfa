export type DataConfidenceLevel = 'reliable' | 'partial' | 'insufficient';

export type DataConfidence = {
  level: DataConfidenceLevel;
  reason: string;
  source: string;
  dateBasis: string;
  lastRefreshedAt: string | null;
  missingCount: number;
  missingBreakdown: {
    unobservedRows: number;
    attributionRows: number;
    incompleteCostRows: number;
  };
};

export type DataConfidenceInput = {
  expectedRows: number | null;
  observedRows: number;
  missingAttributionRows: number;
  incompleteCostRows?: number;
  lastRefreshedAt: string | Date | null;
  source: string;
  dateBasis?: string;
  sourceFailed?: boolean;
};

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function refreshedAt(value: string | Date | null): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function evaluateDataConfidence(input: DataConfidenceInput): DataConfidence {
  const observedRows = count(input.observedRows);
  const missingAttributionRows = count(input.missingAttributionRows);
  const incompleteCostRows = count(input.incompleteCostRows ?? 0);
  const expectedRows = input.expectedRows === null ? null : count(input.expectedRows);
  const unobservedRows = expectedRows === null ? 0 : Math.max(expectedRows - observedRows, 0);
  const missingCount = Math.max(unobservedRows, missingAttributionRows) + incompleteCostRows;
  const shared = {
    source: input.source,
    dateBasis: input.dateBasis ?? 'Selected clinic period in Asia/Kuala_Lumpur',
    lastRefreshedAt: refreshedAt(input.lastRefreshedAt),
    missingCount,
    missingBreakdown: {
      unobservedRows,
      attributionRows: missingAttributionRows,
      incompleteCostRows,
    },
  };

  if (input.sourceFailed) {
    return { ...shared, level: 'insufficient', reason: `${input.source} failed, so this metric cannot be verified.` };
  }
  if (expectedRows === null) {
    return { ...shared, level: 'insufficient', reason: 'The expected denominator is unknown for this source.' };
  }
  if (expectedRows > 0 && observedRows === 0) {
    return { ...shared, level: 'insufficient', reason: `No rows were observed although ${expectedRows} were expected.` };
  }
  if (missingAttributionRows > 0) {
    return {
      ...shared,
      level: 'partial',
      reason: `${missingAttributionRows} ${missingAttributionRows === 1 ? 'row has' : 'rows have'} incomplete attribution.`,
    };
  }
  if (incompleteCostRows > 0) {
    return {
      ...shared,
      level: 'partial',
      reason: `Cost data is incomplete for ${incompleteCostRows} ${incompleteCostRows === 1 ? 'row' : 'rows'}.`,
    };
  }
  if (unobservedRows > 0) {
    return {
      ...shared,
      level: 'partial',
      reason: `${unobservedRows} expected ${unobservedRows === 1 ? 'row is' : 'rows are'} missing.`,
    };
  }
  return { ...shared, level: 'reliable', reason: 'All expected rows were observed with complete attribution.' };
}

const CONFIDENCE_RANK: Record<DataConfidenceLevel, number> = {
  reliable: 0,
  partial: 1,
  insufficient: 2,
};

export function lowestDataConfidence(confidences: DataConfidence[]): DataConfidence {
  return [...confidences].sort((left, right) => CONFIDENCE_RANK[right.level] - CONFIDENCE_RANK[left.level])[0]
    ?? evaluateDataConfidence({
      expectedRows: null,
      observedRows: 0,
      missingAttributionRows: 0,
      lastRefreshedAt: null,
      source: 'unavailable',
    });
}
