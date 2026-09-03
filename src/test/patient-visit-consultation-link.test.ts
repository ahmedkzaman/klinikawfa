import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canOpenConsultationFromHistory } from '@/lib/clinic/consultationAccess';

const source = readFileSync(
  'src/components/patients/PatientProfileSheet.tsx',
  'utf8',
);
const historyHookSource = readFileSync(
  'src/hooks/patients/usePatientVisitHistory.ts',
  'utf8',
);

describe('patient visit consultation links', () => {
  it('includes the structured diagnosis in visit history', () => {
    expect(historyHookSource).toContain('diagnoses:diagnosis_id');
    expect(source).toContain('getRecordedDiagnosisLabels');
  });

  it('filters voided consultation items at the database query boundary', () => {
    expect(historyHookSource).toContain(".is('consultations.consultation_items.deleted_at', null)");
  });

  it.each(['resident_doctor', 'doctor_admin', 'special_admin'] as const)(
    'allows %s to open the exact visit consultation',
    (role) => {
      expect(canOpenConsultationFromHistory(role, true)).toBe(true);
    },
  );

  it.each([
    'admin',
    'ops_staff',
    'staff_nurse',
    'purchaser',
    'staff',
    'locum',
  ] as const)('does not expose consultation notes to %s', (role) => {
    expect(canOpenConsultationFromHistory(role, true)).toBe(false);
  });

  it('navigates eligible users to the exact queue-entry detail', () => {
    expect(source).toContain('View consultation');
    expect(source).toContain('`/clinic/consultation/${queueEntryId}`');
    expect(source).toContain('canViewClinicalNotes');
  });
});
