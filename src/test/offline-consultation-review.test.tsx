import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineConsultationReview } from '@/components/clinic/consultation/OfflineConsultationReview';
import ConsultationDetail from '@/pages/clinic/ConsultationDetail';

const test = vi.hoisted(() => {
  const selectedDoctor = {
    id: 'doctor-1',
    user_id: 'doctor-user-1',
    name: 'Dr Selected',
    status: 'active' as const,
    on_duty: true as const,
    avatar_url: null,
  };
  const adminDoctor = {
    ...selectedDoctor,
    id: 'doctor-admin',
    user_id: 'doctor-admin-user',
    name: 'Dr Admin',
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
    created_at: '2026-08-02T09:00:00.000Z',
    queue_sequence: 1,
    patients: {
      id: 'patient-1',
      name: 'Patient One',
      date_of_birth: '1990-01-01',
      national_id: '900101-01-0001',
      phone: '0123456789',
    },
    doctors: { id: 'doctor-1', name: 'Dr Selected', avatar_url: null },
  };
  const consultation = {
    id: 'consultation-1',
    queue_entry_id: 'queue-1',
    patient_id: 'patient-1',
    doctor_id: 'doctor-1',
    case_note: 'Recorded after the network outage.',
    diagnosis_id: null,
    diagnosis_text: 'Viral illness',
    dispense_note: 'Hydration advice',
    status: 'in_progress',
    entry_source: 'offline_transcription',
    approval_status: 'pending',
    approval_revision: 7,
    original_consulted_at: '2026-08-02T08:30:00.000Z',
    return_reason: null,
    doctors: { id: 'doctor-1', name: 'Dr Selected', avatar_url: null },
  };
  const auditEntry = {
    id: 'audit-created',
    action: 'submitted',
    actor_id: 'staff-1',
    actor_name: 'Operations One',
    created_at: '2026-08-02T10:05:00.000Z',
    reason: null,
  };

  return {
    selectedDoctor,
    adminDoctor,
    entry,
    state: {
      role: 'resident_doctor',
      currentDoctor: selectedDoctor as typeof selectedDoctor | null,
      consultation: { ...consultation },
      auditEntries: [{ ...auditEntry }] as Array<typeof auditEntry & { snapshot?: unknown }>,
      auditLoading: false,
      auditError: null as Error | null,
      attachments: [
        {
          id: 'attachment-1',
          consultation_id: 'consultation-1',
          file_name: 'outage-note.pdf',
          file_path: 'consultation-1/outage-note.pdf',
          content_type: 'application/pdf',
          remark: 'Original note',
          signedUrl: 'https://example.test/outage-note.pdf',
        },
      ],
    },
    consultation,
    auditEntry,
    review: vi.fn(),
    auditRefetch: vi.fn(),
    deleteAttachment: vi.fn(),
    uploadAttachment: vi.fn(),
    navigate: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => test.navigate,
    useParams: () => ({ queueEntryId: 'queue-1' }),
    useLocation: () => ({ state: null }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: test.toastSuccess,
    error: test.toastError,
    message: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    role: test.state.role,
    user: { email: 'doctor@example.test', user_metadata: { full_name: 'Doctor User' } },
    isLocum: test.state.role === 'locum',
    isDoctorAdmin: test.state.role === 'doctor_admin',
  }),
}));

vi.mock('@/hooks/clinic/useOfflineConsultationApproval', () => ({
  OFFLINE_CONSULTATION_AUDIT_LIMIT: 50,
  useEligibleOfflineConsultationDoctors: () => ({ data: [] }),
  useOfflineConsultationEntryState: () => ({ data: null, refetch: vi.fn() }),
  useSaveOfflineConsultation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProceedOfflineConsultationToDispensary: () => ({ mutateAsync: vi.fn(), isPending: false }),
  assertOfflineConsultationEditable: vi.fn().mockResolvedValue(undefined),
  useReviewOfflineConsultation: () => ({ mutateAsync: test.review, isPending: false }),
  useOfflineConsultationAudit: () => ({
    data: test.state.auditEntries,
    isLoading: test.state.auditLoading,
    error: test.state.auditError,
    refetch: test.auditRefetch,
  }),
}));

vi.mock('@/hooks/clinic/useAttachments', () => ({
  useConsultationAttachments: () => ({ data: test.state.attachments, isLoading: false }),
  useDeleteAttachment: () => ({ mutateAsync: test.deleteAttachment, isPending: false }),
  useUploadAttachment: () => ({ mutateAsync: test.uploadAttachment, isPending: false }),
}));

vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useConsultationQueueEntries: () => ({ data: [test.entry], isLoading: false, error: null }),
  useQueueEntry: () => ({ data: test.entry, isLoading: false, error: null }),
  useUpdateQueueEntry: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: () => ({ data: test.state.currentDoctor, isLoading: false, error: null }),
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
  useClinicPreferences: () => ({
    getPreference: (_key: string, fallback: string) => fallback,
    isLoading: false,
  }),
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

vi.mock('@/components/clinic/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock('@/components/clinic/PatientAlertBanner', () => ({ PatientAlertBanner: () => null }));
vi.mock('@/components/clinic/VisitRemarksBanner', () => ({ VisitRemarksBanner: () => null }));
vi.mock('@/components/clinic/consultation/ConsultationLockBanner', () => ({
  ConsultationLockBanner: () => null,
}));
vi.mock('@/components/clinic/consultation/AddTreatmentBulkDialog', () => ({
  AddTreatmentBulkDialog: () => null,
}));
vi.mock('@/components/clinic/consultation/IssueDocumentModal', () => ({ IssueDocumentModal: () => null }));
vi.mock('@/components/clinic/consultation/DocumentAuditLine', () => ({ DocumentAuditLine: () => null }));
vi.mock('@/components/clinic/consultation/ViewDocumentModal', () => ({ ViewDocumentModal: () => null }));
vi.mock('@/components/clinic/consultation/VitalHistoryTrends', () => ({ VitalHistoryTrends: () => null }));
vi.mock('@/components/clinic/consultation/TreatmentItemCard', () => ({ TreatmentItemCard: () => null }));
vi.mock('@/components/clinic/consultation/MultiDiagnosisPicker', () => ({ MultiDiagnosisPicker: () => null }));
vi.mock('@/components/clinic/patient/FollowUpScheduler', () => ({ FollowUpScheduler: () => null }));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithClient(element: ReactElement, queryClient = createQueryClient()) {
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>),
  };
}

describe('offline consultation doctor review', () => {
  beforeEach(() => {
    test.state.role = 'resident_doctor';
    test.state.currentDoctor = test.selectedDoctor;
    test.state.consultation = { ...test.consultation };
    test.state.auditEntries = [{ ...test.auditEntry }];
    test.state.auditLoading = false;
    test.state.auditError = null;
    test.review.mockReset().mockResolvedValue({
      ...test.consultation,
      approval_status: 'approved',
      approval_revision: 8,
      approved_by: 'doctor-user-1',
      approved_at: '2026-08-02T10:15:00.000Z',
    });
    test.auditRefetch.mockReset().mockResolvedValue({ data: test.state.auditEntries });
    test.toastSuccess.mockReset();
    test.toastError.mockReset();
    test.navigate.mockReset();
    test.deleteAttachment.mockReset().mockResolvedValue(undefined);
    test.uploadAttachment.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it.each([
    ['the selected doctor', 'resident_doctor', test.selectedDoctor],
    ['a doctor administrator', 'doctor_admin', test.adminDoctor],
  ])('renders pending review controls for %s and approves the displayed revision', async (_label, role, currentDoctor) => {
    test.state.role = role;
    test.state.currentDoctor = currentDoctor;
    test.review.mockImplementationOnce(async () => {
      test.state.auditEntries = [
        { ...test.auditEntry },
        {
          id: 'audit-approved',
          action: 'approved',
          actor_id: currentDoctor.user_id,
          actor_name: currentDoctor.name,
          created_at: '2026-08-02T10:15:00.000Z',
          reason: null,
        },
      ];
      return {
        ...test.consultation,
        approval_status: 'approved',
        approval_revision: 8,
        approved_by: currentDoctor.user_id,
        approved_at: '2026-08-02T10:15:00.000Z',
      };
    });

    renderWithClient(<ConsultationDetail />);
    expect(screen.getByPlaceholderText(/Write consultation notes/)).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Issue New Document' })).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(test.review).toHaveBeenCalledWith({
      consultationId: 'consultation-1',
      action: 'approve',
      reason: null,
      expectedRevision: 7,
    }));
    expect(test.toastSuccess).toHaveBeenCalledWith('Offline consultation approved');
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(
      document.querySelector('time[datetime="2026-08-02T10:15:00.000Z"]'),
    ).toBeInTheDocument();
  });

  it('does not render review controls for unrelated doctors, locums, or non-pending records', () => {
    test.state.currentDoctor = test.adminDoctor;
    renderWithClient(<ConsultationDetail />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return for correction' })).not.toBeInTheDocument();

    cleanup();
    test.state.role = 'locum';
    test.state.currentDoctor = test.selectedDoctor;
    renderWithClient(<ConsultationDetail />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    cleanup();
    test.state.role = 'resident_doctor';
    test.state.consultation = {
      ...test.state.consultation,
      approval_status: 'approved',
      approval_revision: 8,
    };
    renderWithClient(<ConsultationDetail />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('Operations One')).toBeInTheDocument();
  });

  it('requires a nonblank correction reason before returning the consultation', async () => {
    renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return consultation' }));
    expect(screen.getByText('Enter a reason for correction.')).toBeInTheDocument();
    expect(test.review).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for correction' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Return consultation' }));
    expect(test.review).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for correction' }), {
      target: { value: 'Clarify the medication dosage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Return consultation' }));

    await waitFor(() => expect(test.review).toHaveBeenCalledWith({
      consultationId: 'consultation-1',
      action: 'return',
      reason: 'Clarify the medication dosage.',
      expectedRevision: 7,
    }));
  });

  it('invalidates stale data and shows a clear revision-conflict error', async () => {
    test.review.mockRejectedValueOnce({ message: 'stale_offline_consultation' });
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
      queryClient,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This consultation changed. Reload and review the latest version.',
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['consultation'] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['offline_consultation_audit', 'consultation-1'],
    });
  });

  it('closes the return dialog so a stale return conflict is visible', async () => {
    test.review.mockRejectedValueOnce({ message: 'stale_offline_consultation' });
    renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for correction' }), {
      target: { value: 'Clarify the medication dosage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Return consultation' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This consultation changed. Reload and review the latest version.',
    );
  });

  it('does not carry a completed same-number revision to another consultation', async () => {
    const rendered = renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    });

    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <OfflineConsultationReview
          consultationId="consultation-2"
          approvalStatus="pending"
          approvalRevision={7}
          canReview
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('clears errors and an open correction draft when consultation identity changes', async () => {
    const rendered = renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return consultation' }));
    expect(screen.getByText('Enter a reason for correction.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for correction' }), {
      target: { value: 'Draft reason for consultation one' },
    });

    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <OfflineConsultationReview
          consultationId="consultation-2"
          approvalStatus="pending"
          approvalRevision={7}
          canReview
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    expect(screen.getByRole('textbox', { name: 'Reason for correction' })).toHaveValue('');
    expect(screen.queryByText('Enter a reason for correction.')).not.toBeInTheDocument();
  });

  it('discards the correction draft when the dialog is cancelled and reopened', () => {
    renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="pending"
        approvalRevision={7}
        canReview
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for correction' }), {
      target: { value: 'Discard this draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));

    expect(screen.getByRole('textbox', { name: 'Reason for correction' })).toHaveValue('');
  });

  it('renders only the latest 50 chronological audit events without snapshot data', () => {
    const filler = Array.from({ length: 45 }, (_, index) => ({
      id: `audit-filler-${index}`,
      action: 'updated',
      actor_id: `staff-${index}`,
      actor_name: `Editor ${index}`,
      created_at: `2026-08-02T11:${String(index).padStart(2, '0')}:00.000Z`,
      reason: null,
    }));
    test.state.auditEntries = [
      {
        id: 'audit-hidden',
        action: 'updated',
        actor_id: 'hidden-user',
        actor_name: 'Hidden oldest actor',
        created_at: '2026-08-02T09:00:00.000Z',
        reason: null,
        snapshot: { case_note: 'never render this clinical snapshot' },
      },
      ...filler,
      { ...test.auditEntry, snapshot: { case_note: 'secret clinical note' } },
      {
        id: 'audit-reassigned', action: 'doctor_reassigned', actor_id: 'staff-1',
        actor_name: 'Operations One', created_at: '2026-08-02T12:00:00.000Z', reason: null,
      },
      {
        id: 'audit-returned', action: 'returned', actor_id: 'doctor-user-1',
        actor_name: 'Dr Selected', created_at: '2026-08-02T12:05:00.000Z',
        reason: 'Clarify the medication dosage.',
      },
      {
        id: 'audit-resubmitted', action: 'resubmitted', actor_id: 'staff-1',
        actor_name: 'Operations One', created_at: '2026-08-02T12:10:00.000Z',
        reason: 'Clarify the medication dosage.',
      },
      {
        id: 'audit-approved', action: 'approved', actor_id: 'doctor-user-1',
        actor_name: 'Dr Selected', created_at: '2026-08-02T12:15:00.000Z', reason: null,
      },
    ];

    renderWithClient(
      <OfflineConsultationReview
        consultationId="consultation-1"
        approvalStatus="approved"
        approvalRevision={8}
        canReview={false}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.queryByText('Hidden oldest actor')).not.toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getAllByText('Edited').length).toBeGreaterThan(0);
    expect(screen.getByText('Doctor reassigned')).toBeInTheDocument();
    expect(screen.getByText('Returned for correction')).toBeInTheDocument();
    expect(screen.getByText('Resubmitted')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getAllByText('Clarify the medication dosage.')).toHaveLength(2);
    expect(screen.getAllByText('Dr Selected').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/02 Aug 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret clinical note|never render this clinical snapshot/)).not.toBeInTheDocument();
  });
});
