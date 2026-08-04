import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/pages/clinic/ConsultationDetail.tsx',
  'utf8',
);

describe('post-dispensary consultation notes', () => {
  it('treats sent-to-dispensary as clinical-notes-only state', () => {
    expect(source).toMatch(
      /const isAtDispensary\s*=\s*entry\?\.clinic_status === 'sent_to_dispensary'/,
    );
    expect(source).toMatch(
      /isLocked \|\| isAtDispensary\s*\? handleUpdateClinicalNotes/,
    );
    expect(source).toMatch(
      /!canUseOfflineEditor && !isLocked && !isAtDispensary/,
    );
  });

  it('persists dispense notes with the other clinical documentation', () => {
    expect(source).toMatch(
      /handleUpdateClinicalNotes[\s\S]*updateConsultation\.mutateAsync\(\{[\s\S]*dispense_note: dispenseNote/,
    );
  });
});
