import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canOpenConsultationFromHistory } from '@/lib/clinic/consultationAccess';

const source = readFileSync(
  'src/components/patients/PatientProfileSheet.tsx',
  'utf8',
);

describe('patient visit consultation links', () => {
  it.each(['resident_doctor', 'doctor_admin'] as const)(
    'allows %s to open the exact visit consultation',
    (role) => {
      expect(canOpenConsultationFromHistory(role, true)).toBe(true);
    },
  );

  it.each([
    'admin',
    'special_admin',
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
