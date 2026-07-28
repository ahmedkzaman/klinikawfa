import type { AppRole } from '@/contexts/AuthContext';
import type { ClinicStatus } from '@/types/clinic';

const CROSS_DOCTOR_NOTE_ROLES = new Set<AppRole>([
  'resident_doctor',
  'doctor_admin',
]);

export function canBrowseConsultationDates(role: AppRole | null) {
  return role !== null && role !== 'guest' && role !== 'locum';
}

export function canReadCrossDoctorNotes(role: AppRole | null) {
  return role !== null && CROSS_DOCTOR_NOTE_ROLES.has(role);
}

export function canOpenConsultationFromHistory(
  role: AppRole | null,
  hasConsultation: boolean,
) {
  return hasConsultation && canReadCrossDoctorNotes(role);
}

export type ConsultationAccessInput = {
  role: AppRole | null;
  currentDoctorId: string | null | undefined;
  attendingDoctorId: string | null | undefined;
  consultationStatus?: string | null;
  queueStatus?: ClinicStatus | null;
};

export function getConsultationAccess(input: ConsultationAccessInput) {
  const ownConsultation =
    !!input.currentDoctorId &&
    input.currentDoctorId === input.attendingDoctorId;
  const completed =
    input.consultationStatus === 'completed' ||
    input.queueStatus === 'completed';
  const isCrossDoctor =
    !ownConsultation && Boolean(input.attendingDoctorId);
  const isCrossDoctorReadOnly =
    completed && isCrossDoctor && canReadCrossDoctorNotes(input.role);

  return {
    canView: ownConsultation || isCrossDoctorReadOnly,
    canEdit: ownConsultation,
    isCrossDoctorReadOnly,
  };
}

export type ConsultationListAccessInput = {
  role: AppRole | null;
  currentDoctorId: string | null | undefined;
  attendingDoctorId: string | null | undefined;
  queueStatus: ClinicStatus;
  selectedDateIsToday: boolean;
};

export function canListConsultationEntry(input: ConsultationListAccessInput) {
  const ownEntry =
    !!input.currentDoctorId &&
    input.currentDoctorId === input.attendingDoctorId;

  if (input.role === 'locum') {
    return input.selectedDateIsToday && ownEntry;
  }

  if (input.queueStatus === 'completed') {
    return canBrowseConsultationDates(input.role);
  }

  return input.selectedDateIsToday && ownEntry;
}
