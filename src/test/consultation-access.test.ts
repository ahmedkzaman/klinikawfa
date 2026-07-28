import { describe, expect, it } from 'vitest';
import {
  canBrowseConsultationDates,
  canListConsultationEntry,
  canOpenConsultationFromHistory,
  canReadCrossDoctorNotes,
  getConsultationAccess,
} from '@/lib/clinic/consultationAccess';

describe('consultation access', () => {
  it.each(['resident_doctor', 'doctor_admin'] as const)(
    '%s can read another doctor completed consultation',
    (role) => {
      expect(canReadCrossDoctorNotes(role)).toBe(true);
      expect(
        getConsultationAccess({
          role,
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
    },
  );

  it('blocks resident doctors from another doctor active consultation', () => {
    expect(
      getConsultationAccess({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        consultationStatus: 'in_progress',
        queueStatus: 'with_doctor',
      }).canView,
    ).toBe(false);
  });

  it('keeps locums on their own consultations and hides date browsing', () => {
    expect(canBrowseConsultationDates('locum')).toBe(false);
    expect(
      canListConsultationEntry({
        role: 'locum',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        queueStatus: 'completed',
        selectedDateIsToday: false,
      }),
    ).toBe(false);
    expect(
      getConsultationAccess({
        role: 'locum',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-a',
        consultationStatus: 'in_progress',
        queueStatus: 'with_doctor',
      }).canEdit,
    ).toBe(true);
  });

  it.each([
    'ops_staff',
    'operations',
    'staff_nurse',
    'purchaser',
    'staff',
    'admin',
    'special_admin',
  ] as const)('%s cannot read cross-doctor clinical notes', (role) => {
    expect(canReadCrossDoctorNotes(role)).toBe(false);
    expect(canOpenConsultationFromHistory(role, true)).toBe(false);
  });

  it('lists own active work today and approved completed work on past dates', () => {
    expect(
      canListConsultationEntry({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-a',
        queueStatus: 'with_doctor',
        selectedDateIsToday: true,
      }),
    ).toBe(true);
    expect(
      canListConsultationEntry({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        queueStatus: 'completed',
        selectedDateIsToday: false,
      }),
    ).toBe(true);
    expect(
      canListConsultationEntry({
        role: 'resident_doctor',
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        queueStatus: 'with_doctor',
        selectedDateIsToday: true,
      }),
    ).toBe(false);
  });

  it.each(['resident_doctor', 'doctor_admin'] as const)(
    '%s can open an existing consultation from patient history',
    (role) => {
      expect(canOpenConsultationFromHistory(role, true)).toBe(true);
      expect(canOpenConsultationFromHistory(role, false)).toBe(false);
    },
  );
});
