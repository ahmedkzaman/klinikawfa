import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfflineConsultationProvenance } from '@/components/clinic/consultation/OfflineConsultationProvenance';

const consultationSource = readFileSync('src/pages/clinic/Consultation.tsx', 'utf8');
const detailSource = readFileSync('src/pages/clinic/ConsultationDetail.tsx', 'utf8');
const provenanceSource = readFileSync(
  'src/components/clinic/consultation/OfflineConsultationProvenance.tsx',
  'utf8',
);

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
  it('shows a role-only list action with explicit visit and date route state', () => {
    expect(consultationSource).toContain("role === 'ops_staff'");
    expect(consultationSource).toContain('Enter offline consultation');
    expect(consultationSource).toContain('offlineConsultationEntry: true');
    expect(consultationSource).toContain('queueEntryId: entry.id');
    expect(consultationSource).toContain('selectedDate');
  });

  it('rejects offline-entry route state for every non-operations-staff role', () => {
    expect(detailSource).toContain("requestedOfflineEntry && role !== 'ops_staff'");
    expect(detailSource).toContain('Offline consultation entry is only available to operations staff.');
  });

  it('renders distinct provenance fields and returned-review context', () => {
    render(
      <OfflineConsultationProvenance
        doctors={doctors}
        doctorId="doctor-active"
        originalConsultedAt="2026-08-01T09:30"
        enteringStaffName="Operations Staff"
        approvalStatus="returned"
        returnReason="Clarify the diagnosis."
        approvedByName={null}
        disabled={false}
        onDoctorChange={vi.fn()}
        onOriginalConsultedAtChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Offline consultation provenance')).toBeInTheDocument();
    expect(screen.getByText('Consulting doctor')).toBeInTheDocument();
    expect(screen.getByText('Original consultation date and time')).toBeInTheDocument();
    expect(screen.getByText('Entering staff')).toBeInTheDocument();
    expect(screen.getByText('Operations Staff')).toBeInTheDocument();
    expect(screen.getByText('Returned')).toBeInTheDocument();
    expect(screen.getByText('Clarify the diagnosis.')).toBeInTheDocument();
    expect(screen.getByText('Approved by')).toBeInTheDocument();
  });

  it('uses eligible active doctors and requires doctor and original time before saving', () => {
    expect(detailSource).toContain('useDoctors()');
    expect(detailSource).toContain("doctor.status === 'active'");
    expect(detailSource).toContain('doctor.on_duty');
    expect(detailSource).toContain('doctor.user_id');
    expect(detailSource).toContain('Select an active consulting doctor.');
    expect(detailSource).toContain('Enter the original consultation date and time.');
  });

  it('uses the guarded save hook and approval-specific save text', () => {
    expect(detailSource).toContain('useSaveOfflineConsultation');
    expect(detailSource).toContain('saveOfflineConsultation.mutateAsync');
    expect(detailSource).toContain('Save for doctor approval');
    expect(detailSource).toContain('Resubmit for approval');
  });

  it('applies offline clinical editability to notes, diagnoses, treatments, and attachments', () => {
    expect(detailSource).toContain('getOfflineConsultationAccess');
    expect(detailSource).toContain('canEditClinical');
    expect(detailSource).toContain('readOnly={!canEditClinical}');
    expect(detailSource).toContain('disabled={!canEditClinical}');
    expect(detailSource).toContain('canEdit={canEditWorkspace}');
    expect(detailSource).toContain('canEditPrice={canEditClinical && !isLocum}');
    expect(detailSource).toContain('if (!canEditClinical) return;');
    expect(detailSource).toContain('canMutateAttachments');
    expect(provenanceSource).not.toContain('<Card');
  });

  it('prompts before changing doctor on an existing pending record', () => {
    expect(detailSource).toContain('handleOfflineDoctorChange');
    expect(detailSource).toContain('window.confirm');
    expect(detailSource).toContain('Change the consulting doctor for this pending record?');
  });

  it('locks approved staff edits but preserves post-save operational continuation', () => {
    expect(detailSource).toContain('offlineAccess.canEditTranscription');
    expect(detailSource).toContain('offlineAccess.canContinueOperationalFlow');
    expect(detailSource).toContain('Proceed to dispensary');
    expect(detailSource).toContain('hasSavedOfflineConsultation');
    expect(detailSource).not.toContain("approval_status: 'completed'");
  });
});
