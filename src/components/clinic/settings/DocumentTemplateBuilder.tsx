import { useMemo, useRef, useState } from 'react';
import { FileText, User, Calendar, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PREVIEW_DICTIONARY: Record<string, string> = {
  '{{patient_name}}': 'Ahmad bin Ali',
  '{{patient_ic}}': '890101-06-5555',
  '{{patient_phone}}': '+60 12-345 6789',
  '{{current_date}}': new Date().toLocaleDateString('en-MY'),
  '{{clinic_name}}': 'Klinik Dr. Ahmed',
  '{{doctor_name}}': 'Dr. Ahmed bin Kamarulzaman',
  '{{diagnosis}}': 'Acute Viral Pharyngitis',
  '{{mc_days}}': '2',
  '{{mc_start}}': new Date().toLocaleDateString('en-MY'),
  '{{mc_end}}': new Date(Date.now() + 86400000).toLocaleDateString('en-MY'),
};

const TAG_GROUPS: { label: string; icon: JSX.Element; tags: string[] }[] = [
  {
    label: 'Patient',
    icon: <User className="h-3.5 w-3.5" />,
    tags: ['{{patient_name}}', '{{patient_ic}}', '{{patient_phone}}'],
  },
  {
    label: 'Clinical',
    icon: <Stethoscope className="h-3.5 w-3.5" />,
    tags: ['{{diagnosis}}', '{{mc_days}}', '{{mc_start}}', '{{mc_end}}'],
  },
  {
    label: 'Admin',
    icon: <Calendar className="h-3.5 w-3.5" />,
    tags: ['{{current_date}}', '{{clinic_name}}', '{{doctor_name}}'],
  },
];

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export default function DocumentTemplateBuilder() {
  const [content, setContent] = useState(
    'MEMORANDUM\n\nDate: {{current_date}}\nTo: Whom It May Concern\n\nThis is to certify that {{patient_name}} (IC: {{patient_ic}}) was examined at {{clinic_name}} by {{doctor_name}}.\n\nDiagnosis: {{diagnosis}}\n\nThe patient is medically unfit for duty for {{mc_days}} day(s), from {{mc_start}} to {{mc_end}}.',
  );
  const [paperSize, setPaperSize] = useState<'A4' | 'A5'>('A4');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const livePreviewHtml = useMemo(() => {
    let html = escapeHtml(content);
    Object.keys(PREVIEW_DICTIONARY).forEach((tag) => {
      const regex = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
      html = html.replace(
        regex,
        `<span class="bg-blue-100 text-blue-900 rounded px-0.5">${escapeHtml(
          PREVIEW_DICTIONARY[tag],
        )}</span>`,
      );
    });
    return html;
  }, [content]);

  const handleInsertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => c + tag);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.substring(0, start) + tag + content.substring(end);
    setContent(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
      {/* LEFT: EDITOR */}
      <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <FileText className="h-4 w-4" />
            Template Editor
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-0.5">
            <Button
              size="sm"
              variant={paperSize === 'A4' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setPaperSize('A4')}
            >
              A4
            </Button>
            <Button
              size="sm"
              variant={paperSize === 'A5' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setPaperSize('A5')}
            >
              A5
            </Button>
          </div>
        </div>

        {/* Tag toolbox */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 space-y-2">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Available Tags
          </div>
          <div className="space-y-2">
            {TAG_GROUPS.map((group) => (
              <div key={group.label} className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs font-medium text-slate-500 min-w-[70px]">
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
          className="flex-1 p-6 border-0 focus-visible:ring-0 rounded-none font-mono text-sm leading-relaxed resize-none bg-transparent"
          placeholder="Start typing your template here…"
        />
      </div>

      {/* RIGHT: PAPER PREVIEW */}
      <div className="bg-slate-200 rounded-xl p-6 flex justify-center items-start overflow-y-auto">
        <div
          className="bg-white shadow-xl transition-all duration-300 ease-in-out"
          style={{
            width: '100%',
            maxWidth: paperSize === 'A4' ? '210mm' : '148mm',
            aspectRatio: paperSize === 'A4' ? '210 / 297' : '148 / 210',
            padding: '25mm',
          }}
        >
          <div
            className="max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-900"
            dangerouslySetInnerHTML={{ __html: livePreviewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
