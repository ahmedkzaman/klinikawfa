import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfflineConsultationProvenance } from '@/components/clinic/consultation/OfflineConsultationProvenance';
import { FollowUpScheduler } from '@/components/clinic/patient/FollowUpScheduler';
import {
  canListConsultationEntry,
  canProceedConsultationToDispensary,
  getConsultationDocumentAccess,
  getConsultationAccess,
  type ConsultationListAccessInput,
} from '@/lib/clinic/consultationAccess';

const appointmentMutation = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useClinicAppointments', () => ({
  usePatientFutureAppointments: () => ({ data: [], isLoading: false }),
  useCreateClinicAppointment: () => ({
    mutateAsync: appointmentMutation,
    isPending: false,
  }),
}));

const doctors = [
  {
    id: 'doctor-active',
    user_id: 'doctor-user-active',
    name: 'Dr Active',
    status: 'active' as const,
    on_duty: true,
    avatar_url: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

describe('operations offline consultation entry', () => {
  it('lists a server-authorized active visit for operations staff', () => {
    const input = {
      role: 'ops_staff',
      currentDoctorId: null,
      attendingDoctorId: 'doctor-active',
      queueStatus: 'with_doctor',
      selectedDateIsToday: true,
      offlineEntryEligible: true,
    } satisfies ConsultationListAccessInput & { offlineEntryEligible: boolean };

    expect(canListConsultationEntry(input)).toBe(true);
  });

  it('does not grant operations staff general cross-doctor clinical visibility', () => {
    expect(
      getConsultationAccess({
        role: 'ops_staff',
        currentDoctorId: null,
        attendingDoctorId: 'doctor-active',
        consultationStatus: 'completed',
        queueStatus: 'completed',
      }),
    ).toMatchObject({ canView: false, canEdit: false });
  });

  it('never proceeds a completed or downstream visit to dispensary', () => {
    expect(canProceedConsultationToDispensary('in_progress', 'with_doctor')).toBe(true);
    expect(canProceedConsultationToDispensary('completed', 'with_doctor')).toBe(false);
    expect(canProceedConsultationToDispensary('in_progress', 'completed')).toBe(false);
    expect(canProceedConsultationToDispensary('in_progress', 'sent_to_dispensary')).toBe(false);
  });

  it('keeps live issue-new and edit/void gates independent', () => {
    expect(
      getConsultationDocumentAccess({
        isOfflineEditor: false,
        canEditWorkspace: false,
        liveCanEdit: true,
        liveIsLocked: true,
      }),
    ).toEqual({ canIssue: true, canEditOrVoid: false });
  });

  it('renders authoritative staff identities and approval timestamps', () => {
    render(
      <OfflineConsultationProvenance
        doctors={doctors}
        doctorId="doctor-active"
        originalConsultedAt="2026-08-01T09:30"
        enteringStaffName="Original Operations Staff"
        enteredAt="2026-08-01T10:00:00.000Z"
        approvalStatus="approved"
        returnReason={null}
        approvedByName="Dr Reviewer"
        approvedAt="2026-08-01T11:00:00.000Z"
        disabled
        onDoctorChange={vi.fn()}
        onOriginalConsultedAtChange={vi.fn()}
      />
    );

    expect(screen.getByText('Original Operations Staff')).toBeInTheDocument();
    expect(screen.getByText(/Entered 1 Aug 2026/)).toBeInTheDocument();
    expect(screen.getByText('Dr Reviewer')).toBeInTheDocument();
    expect(screen.getByText(/Approved 1 Aug 2026/)).toBeInTheDocument();
  });

  it('guards follow-up booking and propagates the selected consulting doctor', async () => {
    const onBeforeBook = vi.fn().mockResolvedValue(true);
    appointmentMutation.mockResolvedValueOnce({ id: 'appointment-1' });
    render(
      <FollowUpScheduler
        patientId="patient-1"
        defaultDoctorId="doctor-selected"
        sourceConsultationId="consultation-1"
        onBeforeBook={onBeforeBook}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Book Appointment' }));

    await waitFor(() => expect(onBeforeBook).toHaveBeenCalledOnce());
    expect(appointmentMutation).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 'patient-1',
      doctor_id: 'doctor-selected',
      source_consultation_id: 'consultation-1',
    }));
  });
});
