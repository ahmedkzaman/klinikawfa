import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StructuredNotes } from '@/hooks/useTranscription';
import { useLanguage } from '@/contexts/LanguageContext';

interface MedicalNotesEditorProps {
  notes: StructuredNotes | null;
  onUpdate: (updates: Partial<StructuredNotes>) => void;
  disabled?: boolean;
}

interface NoteField {
  key: keyof StructuredNotes;
  labelEn: string;
  labelMs: string;
  placeholderEn: string;
  placeholderMs: string;
}

const NOTE_FIELDS: NoteField[] = [
  {
    key: 'chief_complaint',
    labelEn: 'Chief Complaint (CC)',
    labelMs: 'Aduan Utama',
    placeholderEn: 'Primary reason for consultation...',
    placeholderMs: 'Sebab utama konsultasi...',
  },
  {
    key: 'history_present_illness',
    labelEn: 'History of Present Illness (HPI)',
    labelMs: 'Sejarah Penyakit Sekarang',
    placeholderEn: 'Onset, duration, severity, symptoms...',
    placeholderMs: 'Permulaan, tempoh, keterukan, gejala...',
  },
  {
    key: 'past_medical_history',
    labelEn: 'Past Medical History (PMH)',
    labelMs: 'Sejarah Perubatan Lepas',
    placeholderEn: 'Previous illnesses, surgeries, conditions...',
    placeholderMs: 'Penyakit, pembedahan, keadaan lepas...',
  },
  {
    key: 'family_history',
    labelEn: 'Family History (FH)',
    labelMs: 'Sejarah Keluarga',
    placeholderEn: 'Relevant family medical conditions...',
    placeholderMs: 'Keadaan perubatan keluarga yang berkaitan...',
  },
  {
    key: 'allergies',
    labelEn: 'Allergies',
    labelMs: 'Alahan',
    placeholderEn: 'Drug, food, or environmental allergies...',
    placeholderMs: 'Alahan ubat, makanan, atau persekitaran...',
  },
  {
    key: 'social_history',
    labelEn: 'Social History',
    labelMs: 'Sejarah Sosial',
    placeholderEn: 'Smoking, alcohol, occupation...',
    placeholderMs: 'Merokok, alkohol, pekerjaan...',
  },
  {
    key: 'examination_findings',
    labelEn: 'Examination Findings',
    labelMs: 'Penemuan Pemeriksaan',
    placeholderEn: 'Physical examination observations...',
    placeholderMs: 'Pemerhatian pemeriksaan fizikal...',
  },
  {
    key: 'assessment',
    labelEn: 'Assessment',
    labelMs: 'Penilaian',
    placeholderEn: 'Clinical impression or diagnosis...',
    placeholderMs: 'Tanggapan klinikal atau diagnosis...',
  },
  {
    key: 'plan',
    labelEn: 'Plan',
    labelMs: 'Pelan',
    placeholderEn: 'Treatment plan, medications, follow-up...',
    placeholderMs: 'Pelan rawatan, ubat, susulan...',
  },
];

export function MedicalNotesEditor({ notes, onUpdate, disabled }: MedicalNotesEditorProps) {
  const { language } = useLanguage();

  return (
    <div className="space-y-4">
      {NOTE_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={field.key} className="text-sm font-medium">
            {language === 'ms' ? field.labelMs : field.labelEn}
          </Label>
          <Textarea
            id={field.key}
            value={notes?.[field.key] || ''}
            onChange={(e) => onUpdate({ [field.key]: e.target.value })}
            placeholder={language === 'ms' ? field.placeholderMs : field.placeholderEn}
            disabled={disabled}
            className="min-h-[60px] text-sm resize-none"
            rows={2}
          />
        </div>
      ))}
    </div>
  );
}
