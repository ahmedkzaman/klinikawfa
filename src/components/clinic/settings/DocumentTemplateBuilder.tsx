import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, User, Calendar, Stethoscope, Save, Clock,
  Plus, Copy, Trash2, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useUpsertDocumentTemplate,
  useDocumentTemplates,
  useDeleteDocumentTemplate,
  type DocumentTemplate,
} from '@/hooks/clinic/useClinicDocuments';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { escapeHtml } from '@/lib/security';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { ConsultationDocumentPage } from '@/components/clinic/consultation/ConsultationDocumentPage';

const PREVIEW_DICTIONARY: Record<string, string> = {
  '{{patient_name}}': 'Ahmad bin Ali',
  '{{patient_ic}}': '890101-06-5555',
  '{{patient_phone}}': '+60 12-345 6789',
  '{{patient_age}}': '36y',
  '{{current_date}}': new Date().toLocaleDateString('en-MY'),
  '{{clinic_name}}': 'Klinik Dr. Ahmed',
  '{{doctor_name}}': 'Dr. Ahmed bin Kamarulzaman',
  '{{diagnosis}}': 'Acute Viral Pharyngitis',
  '{{mc_days}}': '2',
  '{{mc_start}}': new Date().toLocaleDateString('en-MY'),
  '{{mc_end}}': new Date(Date.now() + 86400000).toLocaleDateString('en-MY'),
  '{{time_in}}': '9:00 AM',
  '{{time_out}}': '10:30 AM',
};

const TAG_GROUPS: { label: string; icon: JSX.Element; tags: string[] }[] = [
  { label: 'Patient', icon: <User className="h-3.5 w-3.5" />,
    tags: ['{{patient_name}}', '{{patient_ic}}', '{{patient_phone}}', '{{patient_age}}'] },
  { label: 'Clinical', icon: <Stethoscope className="h-3.5 w-3.5" />,
    tags: ['{{diagnosis}}', '{{mc_days}}', '{{mc_start}}', '{{mc_end}}'] },
  { label: 'Time', icon: <Clock className="h-3.5 w-3.5" />,
    tags: ['{{time_in}}', '{{time_out}}'] },
  { label: 'Admin', icon: <Calendar className="h-3.5 w-3.5" />,
    tags: ['{{current_date}}', '{{clinic_name}}', '{{doctor_name}}'] },
];

type PaperSize = 'A4' | 'A5' | 'A6';
type Orientation = 'portrait' | 'landscape';
type DocType = 'mc' | 'timeslip' | 'referral' | 'memo' | 'prescription' | 'quarantine' | 'consent' | 'lab_request' | 'other';

interface TemplateSettings {
  name: string;
  type: DocType;
  paperSize: PaperSize;
  orientation: Orientation;
}

const PAPER_DIMS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'mc', label: 'Medical Certificate' },
  { value: 'timeslip', label: 'Timeslip (Attendance Slip)' },
  { value: 'referral', label: 'Referral Letter' },
  { value: 'memo', label: 'Memo / Cover Letter' },
  { value: 'prescription', label: 'Prescription Slip' },
  { value: 'quarantine', label: 'Quarantine Order' },
  { value: 'consent', label: 'Consent Form' },
  { value: 'lab_request', label: 'Lab / Imaging Request' },
  { value: 'other', label: 'Other Document' },
];

const DOC_TYPE_LABEL = (v: string) =>
  DOC_TYPES.find((d) => d.value === v)?.label ?? v;

const BLANK_CONTENT =
  'MEMORANDUM\n\nDate: {{current_date}}\nTo: Whom It May Concern\n\nThis is to certify that {{patient_name}} (IC: {{patient_ic}}) was examined at {{clinic_name}} by {{doctor_name}}.\n\nDiagnosis: {{diagnosis}}';

export default function DocumentTemplateBuilder() {
  const { settings: clinicSettings } = useClinicSettings();
  const { data: templates = [], isLoading } = useDocumentTemplates();
  const upsert = useUpsertDocumentTemplate();
  const del = useDeleteDocumentTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<TemplateSettings>({
    name: 'New Template',
    type: 'memo',
    paperSize: 'A4',
    orientation: 'portrait',
  });
  const [content, setContent] = useState(BLANK_CONTENT);
  const [confirmDelete, setConfirmDelete] = useState<DocumentTemplate | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateSetting = <K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const loadTemplate = (t: DocumentTemplate) => {
    setEditingId(t.id);
    setSettings({
      name: t.name,
      type: (t.type as DocType) || 'other',
      paperSize: (t.paper_size as PaperSize) || 'A4',
      orientation: (t.orientation as Orientation) || 'portrait',
    });
    setContent(t.content || '');
  };

  const startNew = () => {
    setEditingId(null);
    setSettings({ name: 'New Template', type: 'memo', paperSize: 'A4', orientation: 'portrait' });
    setContent(BLANK_CONTENT);
  };

  const duplicateTemplate = (t: DocumentTemplate) => {
    setEditingId(null);
    setSettings({
      name: `${t.name} (copy)`,
      type: (t.type as DocType) || 'other',
      paperSize: (t.paper_size as PaperSize) || 'A4',
      orientation: (t.orientation as Orientation) || 'portrait',
    });
    setContent(t.content || '');
  };

  const livePreviewHtml = useMemo(() => {
    let html = escapeHtml(content);
    Object.keys(PREVIEW_DICTIONARY).forEach((tag) => {
      const regex = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
      html = html.replace(regex,
        `<span class="bg-blue-100 text-blue-900 rounded px-0.5">${escapeHtml(PREVIEW_DICTIONARY[tag])}</span>`);
    });
    return html;
  }, [content]);

  const { finalW, finalH, padding } = useMemo(() => {
    const base = PAPER_DIMS[settings.paperSize];
    const isLandscape = settings.orientation === 'landscape';
    return {
      finalW: isLandscape ? base.h : base.w,
      finalH: isLandscape ? base.w : base.h,
      padding: settings.paperSize === 'A6' ? '15mm' : '25mm',
    };
  }, [settings.paperSize, settings.orientation]);

  const handleInsertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) { setContent((c) => c + tag); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.substring(0, start) + tag + content.substring(end);
    setContent(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSave = () => {
    upsert.mutate(
      {
        ...(editingId ? { id: editingId } : {}),
        name: settings.name,
        type: settings.type,
        content,
        paper_size: settings.paperSize,
        orientation: settings.orientation,
      },
      {
        onSuccess: (row) => {
          // Persist edit-mode on the freshly inserted row
          if (!editingId && row?.id) setEditingId(row.id);
        },
      }
    );
  };

  // Auto-select first template on initial load if nothing is being edited
  useEffect(() => {
    if (!editingId && templates.length > 0 && settings.name === 'New Template') {
      // Don't auto-load; let user pick. (Comment intentional.)
    }
  }, [templates, editingId, settings.name]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 text-slate-700 shrink-0" />
          <div className="text-sm font-semibold text-slate-900 truncate">
            {editingId ? `Editing: ${settings.name}` : 'New Template'}
          </div>
          <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded">
            {settings.paperSize} · {settings.orientation}
          </span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending} className="gap-1.5">
          <Save className="h-4 w-4" />
          {upsert.isPending ? 'Saving…' : editingId ? 'Update Template' : 'Save as New'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_1fr] gap-4 flex-1 min-h-0">
        {/* LEFT: TEMPLATES LIST */}
        <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-0">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Templates
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={startNew}>
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              <div className="text-xs text-slate-400 p-2">Loading…</div>
            ) : templates.length === 0 ? (
              <div className="text-xs text-slate-400 p-2">
                No templates yet. Click <b>New</b> and save your first one.
              </div>
            ) : (
              templates.map((t) => {
                const active = t.id === editingId;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'group rounded-lg border px-2.5 py-2 cursor-pointer transition-colors',
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-transparent hover:bg-slate-50 hover:border-slate-200',
                    )}
                    onClick={() => loadTemplate(t)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {t.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {DOC_TYPE_LABEL(t.type)} · {t.paper_size} {t.orientation}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Edit"
                          className="p-1 rounded hover:bg-slate-200 text-slate-600"
                          onClick={(e) => { e.stopPropagation(); loadTemplate(t); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Duplicate"
                          className="p-1 rounded hover:bg-slate-200 text-slate-600"
                          onClick={(e) => { e.stopPropagation(); duplicateTemplate(t); }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          className="p-1 rounded hover:bg-red-100 text-red-600"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(t); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MIDDLE: EDITOR */}
        <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto">
            {/* Document Settings */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-3">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Document Settings
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Template Name</Label>
                  <Input
                    value={settings.name}
                    onChange={(e) => updateSetting('name', e.target.value)}
                    className="h-8 text-sm"
                    placeholder="e.g. Standard MC"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Document Type</Label>
                  <Select value={settings.type} onValueChange={(v) => updateSetting('type', v as DocType)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Paper Size</Label>
                  <ToggleGroup
                    type="single" value={settings.paperSize}
                    onValueChange={(v) => v && updateSetting('paperSize', v as PaperSize)}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="A4" className="h-8 px-3 text-xs">A4</ToggleGroupItem>
                    <ToggleGroupItem value="A5" className="h-8 px-3 text-xs">A5</ToggleGroupItem>
                    <ToggleGroupItem value="A6" className="h-8 px-3 text-xs">A6</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Orientation</Label>
                  <ToggleGroup
                    type="single" value={settings.orientation}
                    onValueChange={(v) => v && updateSetting('orientation', v as Orientation)}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="portrait" className="h-8 px-3 text-xs">Portrait</ToggleGroupItem>
                    <ToggleGroupItem value="landscape" className="h-8 px-3 text-xs">Landscape</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>

            {/* Tag toolbox */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Available Tags
              </div>
              <div className="space-y-2">
                {TAG_GROUPS.map((group) => (
                  <div key={group.label} className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500 min-w-[70px] pt-1">
                      {group.icon} {group.label}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {group.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleInsertTag(tag)}
                          className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-200 rounded hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Editor */}
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[300px] p-6 border-0 focus-visible:ring-0 rounded-none font-mono text-sm leading-relaxed resize-none bg-transparent"
              placeholder="Start typing your template here…"
            />
          </div>
        </div>

        {/* RIGHT: PAPER PREVIEW */}
        <div className="bg-slate-200 rounded-xl p-6 flex justify-center items-start overflow-y-auto min-h-0">
          <ConsultationDocumentPage
            settings={clinicSettings}
            className="shadow-xl transition-all duration-300 ease-in-out"
            style={{
              width: '100%',
              maxWidth: `${finalW}mm`,
              aspectRatio: `${finalW} / ${finalH}`,
              padding,
            }}
          >
            <div
              className="max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-900"
              dangerouslySetInnerHTML={{ __html: livePreviewHtml }}
            />
          </ConsultationDocumentPage>
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be removed from the picker. Documents already issued
              from this template are kept intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                del.mutate(confirmDelete.id, {
                  onSuccess: () => {
                    if (editingId === confirmDelete.id) startNew();
                    setConfirmDelete(null);
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
