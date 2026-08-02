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

export type OfflineConsultationAccessInput = {
  role: AppRole | null;
  currentDoctorId: string | null | undefined;
  attendingDoctorId: string | null | undefined;
  entrySource: string | null | undefined;
  approvalStatus: string | null | undefined;
};

/**
 * UI-only state for offline transcription controls. The approval RPCs remain
 * authoritative for every save, review, and state transition.
 */
export function getOfflineConsultationAccess(input: OfflineConsultationAccessInput) {
  const isOfflineTranscription = input.entrySource === 'offline_transcription';
  const isEditableStatus =
    input.approvalStatus === 'pending' || input.approvalStatus === 'returned';
  const isSelectedDoctor =
    !!input.currentDoctorId && input.currentDoctorId === input.attendingDoctorId;
  const isReviewRole =
    input.role === 'resident_doctor' || input.role === 'doctor_admin';
  const canEditTranscription =
    input.role === 'ops_staff' && isOfflineTranscription && isEditableStatus;

  return {
    canEnter: input.role === 'ops_staff' && !input.entrySource,
    canEditTranscription,
    canReview:
      isOfflineTranscription &&
      input.approvalStatus === 'pending' &&
      isReviewRole &&
      (input.role === 'doctor_admin' || isSelectedDoctor),
    isLockedForStaff:
      input.role === 'ops_staff' && isOfflineTranscription && !canEditTranscription,
    canContinueOperationalFlow: isOfflineTranscription && isEditableStatus,
  };
}
