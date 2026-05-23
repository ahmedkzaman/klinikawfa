import { useEffect, useMemo, useState } from 'react';
import { FileText, Save, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  getPaperStyle,
  type PaperOrientation,
  type PaperSize,
} from '@/lib/clinic/paperStyle';
import {
  useAddConsultationDocument,
  useUpdateConsultationDocument,
  type ConsultationDocument,
  type DocumentTemplate,
} from '@/hooks/clinic/useClinicDocuments';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';
import { calculateClinicalAge } from '@/lib/clinic/clinicalAge';

interface PatientLite {
  id: string;
  name?: string | null;
  national_id?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: DocumentTemplate | null;
  patient: PatientLite | null;
  consultationId: string | null;
  existingDoc?: ConsultationDocument | null;
}

export function IssueDocumentModal({
  isOpen,
  onClose,
  template,
  patient,
  consultationId,
  existingDoc,
}: Props) {
  const { settings } = useClinicSettings();
  const { data: doctor } = useCurrentDoctor();
  const addDoc = useAddConsultationDocument();
  const updateDoc = useUpdateConsultationDocument();
  const [content, setContent] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');

  const isEdit = !!existingDoc;
  const docType = existingDoc?.type ?? template?.type ?? null;
  const isTimeslip = docType === 'timeslip';

  const formatTime12h = (hhmm: string): string => {
    if (!hhmm) return '______';
    const [hStr, mStr] = hhmm.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return '______';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const substitutions = useMemo<Record<string, string>>(
    () => ({
      '{{patient_name}}': patient?.name ?? '',
      '{{patient_ic}}': patient?.national_id ?? '',
      '{{patient_phone}}': patient?.phone ?? '',
      '{{patient_age}}': calculateClinicalAge(patient?.date_of_birth),
      '{{current_date}}': new Date().toLocaleDateString('en-MY'),
      '{{date}}': new Date().toLocaleDateString('en-MY'),
      '{{clinic_name}}': settings?.clinic_name ?? 'Klinik Awfa',
      '{{doctor_name}}': doctor?.name ?? '',
      '{{diagnosis}}': '',
      '{{mc_days}}': '',
      '{{mc_start}}': '',
      '{{mc_end}}': '',
      '{{time_in}}': formatTime12h(timeIn),
      '{{time_out}}': formatTime12h(timeOut),
    }),
    [patient, settings, doctor, timeIn, timeOut],
  );

  // Reset time fields and auto-populate on open
  useEffect(() => {
    if (!isOpen) {
      setTimeIn('');
      setTimeOut('');
      return;
    }
    if (!existingDoc) {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      setTimeOut(`${hh}:${mm}`);
      setTimeIn('');
    }
  }, [isOpen, existingDoc]);

  useEffect(() => {
    if (!isOpen) return;
    if (existingDoc) {
      setContent(existingDoc.content || '');
      return;
    }
    if (!template) return;
    let next = template.content || '';
    Object.entries(substitutions).forEach(([tag, value]) => {
      const re = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
      next = next.replace(re, value);
    });
    setContent(next);
  }, [isOpen, template, existingDoc, substitutions]);

  const source = existingDoc ?? template;
  if (!source) return null;

  const paperSize = (source.paper_size as PaperSize) ?? 'A4';
  const orientation = (source.orientation as PaperOrientation) ?? 'portrait';
  const paperStyle = getPaperStyle(paperSize, orientation);
  const displayName = existingDoc?.template_name ?? template?.name ?? 'Document';

  const handleSave = async () => {
    if (isEdit && existingDoc) {
      await updateDoc.mutateAsync({
        id: existingDoc.id,
        consultation_id: existingDoc.consultation_id,
        content,
      });
      onClose();
      return;
    }
    if (!consultationId || !patient?.id || !template) return;
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

  const isPending = isEdit ? updateDoc.isPending : addDoc.isPending;
  const saveDisabled = isEdit
    ? isPending
    : !consultationId || !patient?.id || isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEdit ? 'Edit' : 'Issue'}: {displayName}
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
            disabled={saveDisabled}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save to Consultation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
