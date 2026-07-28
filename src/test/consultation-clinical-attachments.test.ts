import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const consultationStrip = readFileSync(
  'src/components/clinic/consultation/SessionAttachmentsStrip.tsx',
  'utf8',
);
const consultationDetail = readFileSync(
  'src/pages/clinic/ConsultationDetail.tsx',
  'utf8',
);
const queueBoard = readFileSync('src/pages/clinic/QueueBoard.tsx', 'utf8');

describe('consultation clinical attachments', () => {
  it('lets an editing doctor upload images and PDFs from consultation notes', () => {
    expect(consultationStrip).toContain('useUploadAttachment');
    expect(consultationStrip).toContain('type="file"');
    expect(consultationStrip).toContain('accept="image/*,application/pdf"');
    expect(consultationStrip).toContain('Clinical attachment');
    expect(consultationStrip).toContain('canEdit &&');
    expect(consultationDetail).toContain('canEdit={canEditWorkspace}');
  });

  it('shows the same visit attachments in the completed visit panel', () => {
    expect(queueBoard).toContain(
      "@/components/clinic/consultation/SessionAttachmentsStrip",
    );
    expect(queueBoard).toContain(
      'consultationId={completedConsultation?.id}',
    );
    expect(queueBoard).toContain('canEdit={false}');
  });
});
