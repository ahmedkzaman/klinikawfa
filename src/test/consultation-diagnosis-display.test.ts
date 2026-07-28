import { describe, expect, it } from 'vitest';
import { getRecordedDiagnosisLabels } from '@/lib/clinic/diagnosisDisplay';

describe('recorded consultation diagnosis display', () => {
  it('shows a structured diagnosis even when free text is empty', () => {
    expect(
      getRecordedDiagnosisLabels({
        structuredDiagnosis: 'Acute tonsillitis',
        diagnosisText: '',
      }),
    ).toEqual(['Acute tonsillitis']);
  });

  it('combines structured and free-text diagnoses without duplicates', () => {
    expect(
      getRecordedDiagnosisLabels({
        structuredDiagnosis: 'Acute tonsillitis',
        diagnosisText: 'Acute tonsillitis, Viral fever; Cough',
      }),
    ).toEqual(['Acute tonsillitis', 'Viral fever', 'Cough']);
  });

  it('returns no labels when the visit has no recorded diagnosis', () => {
    expect(
      getRecordedDiagnosisLabels({
        structuredDiagnosis: null,
        diagnosisText: null,
      }),
    ).toEqual([]);
  });
});
