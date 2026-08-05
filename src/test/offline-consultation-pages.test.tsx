import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Consultation from '@/pages/clinic/Consultation';
import ConsultationDetail from '@/pages/clinic/ConsultationDetail';

const test = vi.hoisted(() => {
  const doctor = {
    id: 'doctor-1',
    user_id: 'doctor-user-1',
    name: 'Dr Eligible',
    status: 'active' as const,
    on_duty: true,
    avatar_url: null,
  };
  const entry = {
    id: 'queue-1',
    patient_id: 'patient-1',
    assigned_doctor_id: 'doctor-1',
    assigned_room_id: null,
    clinic_status: 'with_doctor',
    visit_purpose: 'consultation',
    visit_notes: 'Offline visit',
    payment_method: 'cash',
    created_at: new Date().toISOString(),
    queue_sequence: 1,
    patients: {
      id: 'patient-1',
      name: 'Patient One',
      date_of_birth: '1990-01-01',
      national_id: '900101-01-0001',
      phone: '0123456789',
    },
    doctors: { id: 'doctor-1', name: 'Dr Eligible', avatar_url: null },
  };
  const consultation = {
    id: 'consultation-1',
    queue_entry_id: 'queue-1',
    patient_id: 'patient-1',
    doctor_id: 'doctor-1',
    case_note: 'Existing note',
    diagnosis_id: null,
    diagnosis_text: 'Existing diagnosis',
    dispense_note: 'Existing dispense note',
    status: 'in_progress',
    entry_source: 'offline_transcription',
    approval_status: 'pending',
    approval_revision: 3,
    original_consulted_at: '2026-08-01T09:30:00.000Z',
    return_reason: null,
    doctors: { id: 'doctor-1', name: 'Dr Eligible', avatar_url: null },
  };
  const offlineState = {
    consultation_id: 'consultation-1',
    queue_entry_id: 'queue-1',
    doctor_id: 'doctor-1',
    doctor_name: 'Dr Eligible',
    approval_status: 'pending',
    approval_revision: 3,
    entered_by_name: 'Operations One',
    entered_at: '2026-08-01T10:00:00.000Z',
    approved_by_name: null,
    approved_at: null,
    return_reason: null,
    consultation_status: 'in_progress',
    queue_status: 'with_doctor',
  };
  return {
    state: {
      role: 'ops_staff',
      currentDoctor: null as typeof doctor | null,
      eligibleVisitIds: new Set(['queue-1']),
      entry: { ...entry },
      consultation: { ...consultation } as typeof consultation | null,
      offlineState: { ...offlineState } as typeof offlineState | null,
      eligibleDoctors: [doctor],
      locationState: {
        offlineConsultationEntry: true,
        queueEntryId: 'queue-1',
        selectedDate: '2026-08-01',
      } as Record<string, unknown> | null,
      locationSearch: '',
    },
    doctor,
    navigate: vi.fn(),
    save: vi.fn(),
    proceed: vi.fn(),
    refetchState: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => test.navigate,
    useParams: () => ({ queueEntryId: 'queue-1' }),
    useLocation: () => ({ state: test.state.locationState, search: test.state.locationSearch }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: test.toastError,
    success: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    role: test.state.role,
    user: { email: 'ops@example.test', user_metadata: { full_name: 'Operations One' } },
    isLocum: test.state.role === 'locum',
    isDoctorAdmin: test.state.role === 'doctor_admin',
  }),
}));

vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  todayInputValue: () => '2026-08-02',
  useConsultationQueueEntries: () => ({ data: [test.state.entry], isLoading: false, error: null }),
  useQueueEntry: () => ({ data: test.state.entry, isLoading: false, error: null }),
  useCallPatient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQueueEntry: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: () => ({ data: test.state.currentDoctor, isLoading: false, error: null }),
}));

vi.mock('@/hooks/clinic/useOfflineConsultationApproval', () => ({
  OFFLINE_CONSULTATION_AUDIT_LIMIT: 50,
  useOfflineConsultationEntryVisits: () => ({
    data: test.state.eligibleVisitIds,
    isLoading: false,
    error: null,
  }),
  useEligibleOfflineConsultationDoctors: () => ({ data: test.state.eligibleDoctors }),
  useOfflineConsultationEntryState: () => ({
    data: test.state.offlineState,
    refetch: test.refetchState,
  }),
  useSaveOfflineConsultation: () => ({ mutateAsync: test.save, isPending: false }),
  useProceedOfflineConsultationToDispensary: () => ({
    mutateAsync: test.proceed,
    isPending: false,
  }),
  assertOfflineConsultationEditable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({ data: test.state.consultation, isLoading: false }),
  useCreateConsultation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateConsultation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePatientConsultationHistory: () => ({ data: [] }),
}));

vi.mock('@/hooks/clinic/useConsultationLock', () => ({
  useConsultationLock: () => ({ isLockedByOther: false, canEdit: true, forceUnlock: vi.fn() }),
}));
vi.mock('@/hooks/clinic/useClinicPreferences', () => ({
  useClinicPreferences: () => ({ getPreference: (_key: string, fallback: string) => fallback, isLoading: false }),
}));
vi.mock('@/hooks/clinic/useVisitConsultationFee', () => ({
  useVisitConsultationFee: () => ({ data: { amount: 0 }, isLoading: false }),
}));
vi.mock('@/hooks/clinic/useVitalSigns', () => ({
  useVitalSigns: () => ({ data: null }),
  useRecordVitalSigns: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => ({ data: [] }),
  useAddConsultationItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRemoveConsultationItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultationItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/clinic/useClinicAppointments', () => ({
  useClinicAppointments: () => ({ data: [] }),
  usePatientFutureAppointments: () => ({ data: [], isLoading: false }),
  useCreateClinicAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/clinic/useInventoryItems', () => ({ useInventoryItemsSafe: () => ({ data: [] }) }));
vi.mock('@/hooks/clinic/useServices', () => ({ useServicesSafe: () => ({ data: [] }) }));
vi.mock('@/hooks/clinic/usePackagesSafe', () => ({ usePackagesSafe: () => ({ data: [] }) }));
vi.mock('@/hooks/clinic/usePackages', () => ({ usePackagesSafe: () => ({ data: [] }) }));
vi.mock('@/hooks/clinic/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('@/hooks/clinic/useClinicDocuments', () => ({
  useConsultationDocuments: () => ({ data: [] }),
  useDeleteConsultationDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDocumentTemplates: () => ({ data: [] }),
}));
vi.mock('@/hooks/clinic/useDiagnoses', () => ({ useDiagnoses: () => ({ diagnoses: [] }) }));
vi.mock('@/hooks/clinic/useClinicSettings', () => ({ useClinicSettings: () => ({ settings: {} }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock('@/components/clinic/StatusBadge', () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock('@/components/clinic/consultation/RoomPickerDialog', () => ({ RoomPickerDialog: () => null }));
vi.mock('@/components/clinic/PatientAlertBanner', () => ({ PatientAlertBanner: () => null }));
vi.mock('@/components/clinic/VisitRemarksBanner', () => ({ VisitRemarksBanner: () => null }));
vi.mock('@/components/clinic/consultation/ConsultationLockBanner', () => ({ ConsultationLockBanner: () => null }));
vi.mock('@/components/clinic/consultation/AddTreatmentBulkDialog', () => ({ AddTreatmentBulkDialog: () => null }));
vi.mock('@/components/clinic/consultation/IssueDocumentModal', () => ({ IssueDocumentModal: () => null }));
vi.mock('@/components/clinic/consultation/DocumentAuditLine', () => ({ DocumentAuditLine: () => null }));
vi.mock('@/components/clinic/consultation/ViewDocumentModal', () => ({ ViewDocumentModal: () => null }));
vi.mock('@/components/clinic/consultation/VitalHistoryTrends', () => ({ VitalHistoryTrends: () => null }));
vi.mock('@/components/clinic/consultation/TreatmentItemCard', () => ({ TreatmentItemCard: () => null }));
vi.mock('@/components/clinic/consultation/MultiDiagnosisPicker', () => ({ MultiDiagnosisPicker: () => null }));
vi.mock('@/components/clinic/consultation/SessionAttachmentsStrip', () => ({ SessionAttachmentsStrip: () => null }));
vi.mock('@/components/clinic/consultation/OfflineConsultationReview', () => ({ OfflineConsultationReview: () => null }));
vi.mock('@/components/clinic/patient/FollowUpScheduler', () => ({ FollowUpScheduler: () => null }));

describe('offline consultation pages', () => {
  beforeEach(() => {
    test.state.role = 'ops_staff';
    test.state.currentDoctor = null;
    test.state.eligibleVisitIds = new Set(['queue-1']);
    test.state.entry = { ...test.state.entry, assigned_doctor_id: 'doctor-1', clinic_status: 'with_doctor' };
    test.state.consultation = {
      id: 'consultation-1', queue_entry_id: 'queue-1', patient_id: 'patient-1', doctor_id: 'doctor-1',
      case_note: 'Existing note', diagnosis_id: null, diagnosis_text: 'Existing diagnosis',
      dispense_note: 'Existing dispense note', status: 'in_progress', entry_source: 'offline_transcription',
      approval_status: 'pending', approval_revision: 3, original_consulted_at: '2026-08-01T09:30:00.000Z',
      return_reason: null, doctors: { id: 'doctor-1', name: 'Dr Eligible', avatar_url: null },
    };
    test.state.offlineState = {
      consultation_id: 'consultation-1', queue_entry_id: 'queue-1', doctor_id: 'doctor-1',
      doctor_name: 'Dr Eligible', approval_status: 'pending', approval_revision: 3,
      entered_by_name: 'Operations One', entered_at: '2026-08-01T10:00:00.000Z',
      approved_by_name: null, approved_at: null, return_reason: null,
      consultation_status: 'in_progress', queue_status: 'with_doctor',
    };
    test.state.eligibleDoctors = [test.doctor];
    test.state.locationState = { offlineConsultationEntry: true, queueEntryId: 'queue-1', selectedDate: '2026-08-01' };
    test.state.locationSearch = '';
    test.navigate.mockReset();
    test.save.mockReset().mockResolvedValue({ approval_status: 'pending', approval_revision: 3 });
    test.proceed.mockReset().mockResolvedValue('queue-1');
    test.refetchState.mockReset().mockImplementation(async () => ({ data: test.state.offlineState }));
    test.toastError.mockReset();
  });

  afterEach(cleanup);

  it('shows the RPC-authorized action only to operations staff and navigates with explicit state', async () => {
    render(<Consultation />);
    const action = await screen.findByRole('button', { name: 'Enter offline consultation' });
    fireEvent.click(action);
    expect(test.navigate).toHaveBeenCalledWith('/clinic/consultation/queue-1?mode=offline', {
      state: expect.objectContaining({ offlineConsultationEntry: true, queueEntryId: 'queue-1' }),
    });

    cleanup();
    test.state.eligibleVisitIds = new Set();
    render(<Consultation />);
    expect(screen.queryByRole('button', { name: 'Enter offline consultation' })).not.toBeInTheDocument();

    cleanup();
    test.state.eligibleVisitIds = new Set(['queue-1']);
    test.state.role = 'resident_doctor';
    test.state.currentDoctor = test.doctor;
    render(<Consultation />);
    expect(screen.queryByRole('button', { name: 'Enter offline consultation' })).not.toBeInTheDocument();
  });

  it('keeps offline entry separate from doctor workflow for operations with a stale doctor profile', async () => {
    test.state.currentDoctor = test.doctor;
    test.state.entry = {
      ...test.state.entry,
      assigned_doctor_id: test.doctor.id,
      clinic_status: 'registered',
    };
    test.state.consultation = null;
    test.state.offlineState = null;

    render(<Consultation />);

    expect(await screen.findByRole('button', { name: 'Enter offline consultation' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Call In' })).not.toBeInTheDocument();

    cleanup();
    render(<ConsultationDetail />);

    expect(await screen.findByRole('button', { name: 'Save for doctor approval' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Call In/ })).not.toBeInTheDocument();
  });

  it('keeps offline entry available when temporary navigation state is lost', async () => {
    test.state.currentDoctor = test.doctor;
    test.state.entry = {
      ...test.state.entry,
      assigned_doctor_id: test.doctor.id,
      clinic_status: 'registered',
    };
    test.state.consultation = null;
    test.state.offlineState = null;
    test.state.locationState = null;
    test.state.locationSearch = '?mode=offline';

    render(<ConsultationDetail />);

    expect(await screen.findByRole('button', { name: 'Save for doctor approval' })).toBeEnabled();
    expect(screen.queryByText('You do not have permission to view this consultation.')).not.toBeInTheDocument();
  });

  it('renders an existing returned offline row after it has moved downstream', async () => {
    test.state.entry = { ...test.state.entry, clinic_status: 'sent_to_dispensary' };
    render(<Consultation />);
    expect(await screen.findByText('Patient One')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter offline consultation' })).toBeInTheDocument();
  });

  it('denies explicit offline route state to non-operations roles', () => {
    test.state.role = 'resident_doctor';
    test.state.currentDoctor = test.doctor;
    render(<ConsultationDetail />);
    expect(screen.getByText('Offline consultation entry is only available to operations staff.')).toBeInTheDocument();
  });

  it('requires an eligible doctor and original time before sending the save payload', async () => {
    test.state.consultation = null;
    test.state.offlineState = null;
    test.state.eligibleDoctors = [];
    render(<ConsultationDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Save for doctor approval' }));
    expect(test.toastError).toHaveBeenCalledWith('Select an active consulting doctor.');
    expect(test.save).not.toHaveBeenCalled();

    cleanup();
    test.state.eligibleDoctors = [test.doctor];
    render(<ConsultationDetail />);
    await waitFor(() => expect(screen.getByLabelText('Original consultation date and time')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save for doctor approval' }));
    expect(test.toastError).toHaveBeenCalledWith('Enter the original consultation date and time.');

    fireEvent.change(screen.getByLabelText('Original consultation date and time'), {
      target: { value: '2026-08-01T09:30' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Write consultation notes/), {
      target: { value: 'Offline note payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save for doctor approval' }));
    await waitFor(() => expect(test.save).toHaveBeenCalledWith(expect.objectContaining({
      queueEntryId: 'queue-1',
      doctorId: 'doctor-1',
      originalConsultedAt: new Date('2026-08-01T09:30').toISOString(),
      caseNote: 'Offline note payload',
      expectedRevision: null,
    })));
  });

  it('reopens a server-authorized pending or returned editor after refresh and direct navigation', async () => {
    const initial = render(<ConsultationDetail />);
    expect(await screen.findByRole('button', { name: 'Save for doctor approval' })).toBeEnabled();

    initial.unmount();
    test.state.locationState = null;
    render(<ConsultationDetail />);

    const save = await screen.findByRole('button', { name: 'Save for doctor approval' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(test.save).toHaveBeenCalledWith(expect.objectContaining({
      queueEntryId: 'queue-1',
      expectedRevision: 3,
    })));

    cleanup();
    test.state.offlineState = {
      ...test.state.offlineState!,
      approval_status: 'returned',
      return_reason: 'Clarify the historical diagnosis',
    };
    render(<ConsultationDetail />);
    expect(await screen.findByRole('button', { name: 'Resubmit for approval' })).toBeEnabled();
    expect(screen.getByText('Clarify the historical diagnosis')).toBeInTheDocument();
  });

  it('does not turn durable offline entry state into cross-doctor access', () => {
    test.state.locationState = null;
    test.state.role = 'resident_doctor';
    test.state.currentDoctor = { ...test.doctor, id: 'doctor-2', user_id: 'doctor-user-2' };

    render(<ConsultationDetail />);

    expect(screen.getByText('You do not have permission to view this consultation.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save for doctor approval' })).not.toBeInTheDocument();
  });

  it('accepts an active historical doctor who is no longer on duty', async () => {
    test.state.consultation = null;
    test.state.offlineState = null;
    test.state.eligibleDoctors = [{ ...test.doctor, on_duty: false }];

    render(<ConsultationDetail />);

    expect(await screen.findByText('Dr Eligible')).toBeInTheDocument();
    expect(screen.queryByText('No active consulting doctors are available.')).not.toBeInTheDocument();
  });

  it('renders returned resubmission and locks approved clinical controls', async () => {
    test.state.offlineState = { ...test.state.offlineState!, approval_status: 'returned', return_reason: 'Clarify notes' };
    const view = render(<ConsultationDetail />);
    expect(await screen.findByRole('button', { name: 'Resubmit for approval' })).toBeEnabled();
    expect(screen.getByText('Clarify notes')).toBeInTheDocument();

    test.state.consultation = { ...test.state.consultation, approval_status: 'approved' };
    test.state.offlineState = { ...test.state.offlineState, approval_status: 'approved' };
    view.rerender(<ConsultationDetail />);
    expect(screen.getByText('This offline consultation was approved. Clinical changes are disabled.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write consultation notes/)).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save for doctor approval' })).toBeDisabled();
  });

  it('offers proceed after save and invokes the guarded transition', async () => {
    render(<ConsultationDetail />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save for doctor approval' }));
    const proceed = await screen.findByRole('button', { name: 'Proceed to dispensary' });
    fireEvent.click(proceed);
    await waitFor(() => expect(test.proceed).toHaveBeenCalledWith({
      consultationId: 'consultation-1',
      expectedRevision: 3,
    }));
    expect(test.navigate).toHaveBeenCalledWith('/clinic/consultation', { replace: true });
  });
});
