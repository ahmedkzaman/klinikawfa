import { describe, expect, it } from 'vitest';

import { evaluateDataConfidence } from '@/lib/clinic/insight/dataConfidence';

const refreshedAt = '2026-08-16T08:00:00.000Z';

describe('evaluateDataConfidence', () => {
  it('is reliable only when the source succeeded and every expected row is complete', () => {
    expect(evaluateDataConfidence({
      expectedRows: 10,
      observedRows: 10,
      missingAttributionRows: 0,
      lastRefreshedAt: refreshedAt,
      source: 'financial-control',
    })).toMatchObject({ level: 'reliable', missingCount: 0, source: 'financial-control' });
  });

  it('is partial and explains missing attribution without treating it as a business action', () => {
    expect(evaluateDataConfidence({
      expectedRows: 10,
      observedRows: 8,
      missingAttributionRows: 2,
      lastRefreshedAt: refreshedAt,
      source: 'financial-control',
    })).toMatchObject({
      level: 'partial',
      missingCount: 2,
      missingBreakdown: { unobservedRows: 2, attributionRows: 2, incompleteCostRows: 0 },
      reason: expect.stringMatching(/2.*attribution/i),
    });
  });

  it.each([
    [{ expectedRows: null, observedRows: 4, sourceFailed: false }, /denominator/i],
    [{ expectedRows: 8, observedRows: 0, sourceFailed: false }, /no rows/i],
    [{ expectedRows: 8, observedRows: 8, sourceFailed: true }, /failed/i],
  ])('is insufficient when the source cannot support the metric', (values, reason) => {
    expect(evaluateDataConfidence({
      ...values,
      missingAttributionRows: 0,
      lastRefreshedAt: refreshedAt,
      source: 'clinic-health',
    })).toMatchObject({ level: 'insufficient', reason: expect.stringMatching(reason) });
  });

  it('downgrades incomplete cost coverage and exposes its date basis', () => {
    expect(evaluateDataConfidence({
      expectedRows: 5,
      observedRows: 5,
      missingAttributionRows: 0,
      incompleteCostRows: 1,
      lastRefreshedAt: refreshedAt,
      source: 'financial-control',
      dateBasis: 'Visit completion date in Asia/Kuala_Lumpur',
    })).toMatchObject({
      level: 'partial',
      dateBasis: 'Visit completion date in Asia/Kuala_Lumpur',
      reason: expect.stringMatching(/cost/i),
    });
  });
});
