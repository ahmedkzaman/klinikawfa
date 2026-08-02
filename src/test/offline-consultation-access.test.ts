import { describe, expect, it } from 'vitest';
import { getOfflineConsultationAccess } from '@/lib/clinic/consultationAccess';

describe('offline consultation access', () => {
  it('allows ops staff to start an offline transcription when no consultation exists', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'ops_staff',
        currentDoctorId: null,
        attendingDoctorId: 'doctor-a',
        entrySource: null,
        approvalStatus: null,
      }),
    ).toMatchObject({
      canEnter: true,
      canEditTranscription: false,
      canReview: false,
      isLockedForStaff: false,
    });
  });

  it.each(['pending', 'returned'] as const)(
    'allows ops staff to edit a %s offline transcription without blocking operations',
    (approvalStatus) => {
      expect(
        getOfflineConsultationAccess({
          role: 'ops_staff',
          currentDoctorId: null,
          attendingDoctorId: 'doctor-a',
          entrySource: 'offline_transcription',
          approvalStatus,
        }),
      ).toMatchObject({
        canEnter: false,
        canEditTranscription: true,
        canReview: false,
        isLockedForStaff: false,
        canContinueOperationalFlow: true,
      });
    },
  );

  it('locks approved offline transcriptions for ops staff', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'ops_staff',
        currentDoctorId: null,
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'approved',
      }),
    ).toMatchObject({
      canEditTranscription: false,
      canReview: false,
      isLockedForStaff: true,
    });
  });

  it('allows the selected doctor to review a pending transcription', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'pending',
      }).canReview,
    ).toBe(true);
  });

  it('allows doctor admins to review another doctor pending transcription', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'doctor_admin',
        currentDoctorId: 'doctor-b',
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'pending',
      }).canReview,
    ).toBe(true);
  });

  it('denies an ordinary doctor review of another doctor transcription', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-b',
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'pending',
      }).canReview,
    ).toBe(false);
  });

  it('does not treat a staff member with a matching doctor ID as a reviewer', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'ops_staff',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'pending',
      }).canReview,
    ).toBe(false);
  });

  it('keeps locums unable to enter, edit, or review offline transcriptions', () => {
    expect(
      getOfflineConsultationAccess({
        role: 'locum',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-a',
        entrySource: 'offline_transcription',
        approvalStatus: 'pending',
      }),
    ).toMatchObject({
      canEnter: false,
      canEditTranscription: false,
      canReview: false,
    });
  });
});
