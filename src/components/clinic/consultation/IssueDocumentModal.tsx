import { useEffect, useMemo, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  getPaperStyle,
  type PaperOrientation,
  type PaperSize,
} from '@/lib/clinic/paperStyle';
import {
  useAddConsultationDocument,
  type DocumentTemplate,
} from '@/hooks/clinic/useClinicDocuments';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';

interface PatientLite {
  id: string;
  name?: string | null;
  national_id?: string | null;
  phone?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: DocumentTemplate | null;
  patient: PatientLite | null;
  consultationId: string | null;
}

export function IssueDocumentModal({
  isOpen,
  onClose,
  template,
  patient,
  consultationId,
}: Props) {
  const { settings } = useClinicSettings();
  const { data: doctor } = useCurrentDoctor();
  const addDoc = useAddConsultationDocument();
  const [content, setContent] = useState('');

  const substitutions = useMemo<Record<string, string>>(
    () => ({
      '{{patient_name}}': patient?.name ?? '',
      '{{patient_ic}}': patient?.national_id ?? '',
      '{{patient_phone}}': patient?.phone ?? '',
      '{{current_date}}': new Date().toLocaleDateString('en-MY'),
      '{{clinic_name}}': settings?.clinic_name ?? 'Klinik Awfa',
      '{{doctor_name}}': doctor?.name ?? '',
      '{{diagnosis}}': '',
      '{{mc_days}}': '',
      '{{mc_start}}': '',
      '{{mc_end}}': '',
    }),
    [patient, settings, doctor],
  );

  useEffect(() => {
    if (!isOpen || !template) return;
    let next = template.content || '';
    Object.entries(substitutions).forEach(([tag, value]) => {
      const re = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
      next = next.replace(re, value);
    });
    setContent(next);
  }, [isOpen, template, substitutions]);

  if (!template) return null;

  const paperSize = (template.paper_size as PaperSize) ?? 'A4';
  const orientation = (template.orientation as PaperOrientation) ?? 'portrait';
  const paperStyle = getPaperStyle(paperSize, orientation);

  const handleSave = async () => {
    if (!consultationId || !patient?.id) return;
    await addDoc.mutateAsync({
      consultation_id: consultationId,
      patient_id: patient.id,
      template_id: template.id,
      template_name: template.name,
      type: template.type,
      content,
      paper_size: paperSize,
      orientation,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Issue: {template.name}
            <Badge variant="secondary" className="ml-2 text-xs">
              {paperSize} · {orientation}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 p-4">
          {/* Editor */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden min-h-0">
            <div className="px-3 py-2 border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Edit Content
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 p-4 border-0 focus-visible:ring-0 rounded-none font-mono text-sm leading-relaxed resize-none"
              placeholder="Document content…"
            />
          </div>

          {/* Preview */}
          <div className="bg-slate-200 rounded-lg p-4 flex justify-center items-start overflow-y-auto min-h-0">
            <div
              className="bg-white shadow-xl transition-all duration-300"
              style={paperStyle}
            >
              <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-900">
                {content}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!consultationId || !patient?.id || addDoc.isPending}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {addDoc.isPending ? 'Saving…' : 'Save to Consultation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
