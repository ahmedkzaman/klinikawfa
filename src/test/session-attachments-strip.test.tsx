import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionAttachmentsStrip } from '@/components/clinic/consultation/SessionAttachmentsStrip';
import { getOfflineConsultationAccess } from '@/lib/clinic/consultationAccess';

const test = vi.hoisted(() => ({
  deleteAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
  useUploadAttachment: vi.fn(),
  attachments: [{
    id: 'attachment-1',
    consultation_id: 'consultation-1',
    file_name: 'outage-note.pdf',
    file_path: 'consultation-1/outage-note.pdf',
    content_type: 'application/pdf',
    created_at: '2026-08-02T10:00:00.000Z',
    remark: 'Original note',
    signedUrl: 'https://example.test/outage-note.pdf',
  }],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/clinic/useAttachments', () => ({
  useConsultationAttachments: () => ({ data: test.attachments, isLoading: false }),
  useDeleteAttachment: () => ({ mutateAsync: test.deleteAttachment, isPending: false }),
  useUploadAttachment: test.useUploadAttachment,
}));

describe('SessionAttachmentsStrip mutation boundary', () => {
  beforeEach(() => {
    test.deleteAttachment.mockReset().mockResolvedValue(undefined);
    test.uploadAttachment.mockReset().mockResolvedValue(undefined);
    test.useUploadAttachment.mockReset().mockReturnValue({
      mutateAsync: test.uploadAttachment,
      isPending: false,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('allows operations staff to mutate pending offline attachments', async () => {
    const access = getOfflineConsultationAccess({
      role: 'ops_staff',
      currentDoctorId: null,
      attendingDoctorId: 'doctor-1',
      entrySource: 'offline_transcription',
      approvalStatus: 'pending',
    });

    render(
      <SessionAttachmentsStrip
        consultationId="consultation-1"
        canEdit
        canMutate={access.canEditTranscription}
        offlineConsultationId="consultation-1"
      />,
    );

    expect(test.useUploadAttachment).toHaveBeenCalledWith('consultation-1', {
      offlineConsultationId: 'consultation-1',
    });
    expect(screen.getByLabelText('Clinical attachment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove outage-note.pdf' }));
    await waitFor(() => expect(test.deleteAttachment).toHaveBeenCalledWith({
      id: 'attachment-1',
      file_path: 'consultation-1/outage-note.pdf',
      consultation_id: 'consultation-1',
    }));
  });

  it('keeps approved offline attachments visible but locked for operations staff', () => {
    const access = getOfflineConsultationAccess({
      role: 'ops_staff',
      currentDoctorId: null,
      attendingDoctorId: 'doctor-1',
      entrySource: 'offline_transcription',
      approvalStatus: 'approved',
    });

    render(
      <SessionAttachmentsStrip
        consultationId="consultation-1"
        canEdit
        canMutate={access.canEditTranscription}
      />,
    );

    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Clinical attachment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove outage-note.pdf' })).not.toBeInTheDocument();
  });

  it('preserves live consultation mutation behavior when canMutate is omitted', () => {
    render(<SessionAttachmentsStrip consultationId="consultation-1" canEdit />);

    expect(screen.getByLabelText('Clinical attachment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove outage-note.pdf' })).toBeInTheDocument();
  });
});
