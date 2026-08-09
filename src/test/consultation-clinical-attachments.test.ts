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
const queueEntries = readFileSync(
  'src/hooks/clinic/useQueueEntries.ts',
  'utf8',
);

describe('consultation clinical attachments', () => {
  it('lets an editing doctor upload images and PDFs from consultation notes', () => {
    expect(consultationStrip).toContain('useUploadAttachment');
    expect(consultationStrip).toContain('type="file"');
    expect(consultationStrip).toContain('accept="image/*,application/pdf"');
    expect(consultationStrip).toContain('Clinical attachment');
    expect(consultationStrip).toContain('canEdit &&');
    expect(consultationDetail).toContain('canEdit={canEditWorkspace || canUploadClinicalAttachment}');
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

  it('shows diagnosis separately from clinical notes for completed visits', () => {
    expect(queueEntries).toContain('diagnoses:diagnosis_id ( id, name )');
    expect(queueBoard).toContain('getRecordedDiagnosisLabels');
    expect(queueBoard).toContain('completedVisitDiagnoses');
    expect(queueBoard).toContain('completedVisitDiagnoses.map');
    expect(queueBoard).toContain('>Diagnosis</p>');
    expect(queueBoard).toContain('No diagnosis recorded for this visit.');
    expect(queueBoard).not.toContain(
      'completedConsultation?.case_note?.trim() ||\n    completedConsultation?.diagnosis_text?.trim()',
    );
  });

  it('shows a complete billing summary for completed visits', () => {
    expect(queueEntries).toContain(
      'payments ( id, amount, payment_method, payment_type, deleted_at )',
    );
    expect(queueEntries).toContain('dispensed_qty, item_id');
    expect(queueBoard).toContain('completedVisitSubtotal');
    expect(queueBoard).toContain('completedVisitOutstanding');
    expect(queueBoard).toContain('completedVisitPaymentMethods');
    expect(queueBoard).toContain('Subtotal');
    expect(queueBoard).toContain('Outstanding');
    expect(queueBoard).toContain('Payment Method');
  });
});
