import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getConsultationAccess } from '@/lib/clinic/consultationAccess';

const source = readFileSync(
  'src/pages/clinic/ConsultationDetail.tsx',
  'utf8',
);

describe('cross-doctor consultation detail', () => {
  it('loads the exact queue entry instead of relying on the live feed', () => {
    expect(source).toContain('useQueueEntry(queueEntryId)');
  });

  it('derives and displays the cross-doctor read-only state', () => {
    expect(source).toContain('isCrossDoctorReadOnly');
    expect(source).toContain('Read-only consultation');
    expect(source).toContain('access.canView');
  });

  it('guards mutation and automatic-creation paths', () => {
    expect(source).toContain('if (!access.canEdit) return;');
    expect(source).toContain('readOnly={isCrossDoctorReadOnly}');
    expect(source).toContain('disabled={!access.canEdit');
  });

  it('keeps another doctor completed consultation read-only', () => {
    expect(
      getConsultationAccess({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        consultationStatus: 'completed',
        queueStatus: 'completed',
      }),
    ).toEqual({
      canView: true,
      canEdit: false,
      isCrossDoctorReadOnly: true,
    });
  });
});
