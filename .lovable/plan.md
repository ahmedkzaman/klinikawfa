# Document Template Builder — Split-Screen Editor + Paper Preview

A split-screen React component where the left side is a tag-aware text editor and the right side renders a live A4/A5 paper preview with variable substitution.

## UI Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Template Editor                          Paper Preview │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │ A4 / A5      │  │                                 │  │
│  │              │  │    [A4 paper with 25mm margins] │  │
│  │ Available    │  │                                 │  │
│  │ Tags         │  │    Date: 10/05/2026             │  │
│  │  {{name}}    │  │    To: Whom It May Concern      │  │
│  │  {{ic}}      │  │                                 │  │
│  │  ...         │  │    This is to certify that      │  │
│  │              │  │    Ahmad bin Ali ...            │  │
│  │              │  │                                 │  │
│  │              │  │                                 │  │
│  └──────────────┘  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐│
│  │ [Textarea editor with cursor-aware tag injection]   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Files

### New
- `src/components/clinic/settings/DocumentTemplateBuilder.tsx` — The split-screen component (editor + paper preview).
- `src/pages/clinic/settings/DocumentTemplates.tsx` — Page wrapper for the builder (route `/clinic/settings/document-templates`).

### Edited
- `src/App.tsx` — Add route `/clinic/settings/document-templates`.
- `src/pages/clinic/settings/SettingsPage.tsx` — Add "Document Templates" card linking to the new page.

## Component Details (DocumentTemplateBuilder.tsx)

### State
- `content: string` — raw template text.
- `paperSize: 'A4' | 'A5'` — toggles preview dimensions.
- `textareaRef` — for cursor-position tag injection.

### Tag Dictionary (Preview only)
```ts
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
```

### Tag Groups (Left sidebar toolbox)
- **Patient** — `{{patient_name}}`, `{{patient_ic}}`, `{{patient_phone}}`
- **Clinical** — `{{diagnosis}}`, `{{mc_days}}`, `{{mc_start}}`, `{{mc_end}}`
- **Admin** — `{{current_date}}`, `{{clinic_name}}`, `{{doctor_name}}`

### Live Preview Engine
```ts
const livePreviewHtml = useMemo(() => {
  let html = escapeHtml(content);
  Object.keys(PREVIEW_DICTIONARY).forEach(tag => {
    const regex = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
    html = html.replace(regex, `<span class="bg-blue-100">${PREVIEW_DICTIONARY[tag]}</span>`);
  });
  return html;
}, [content]);
```

### Tag Insertion UX
```ts
const handleInsertTag = (tag: string) => {
  const el = textareaRef.current;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  setContent(prev => prev.slice(0, start) + tag + prev.slice(end));
  setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
};
```

### Paper Preview CSS
- Container: `aspect-ratio: 210/297` for A4, `148/210` for A5.
- Width: `maxWidth: 210mm` (A4) or `148mm` (A5).
- Padding: `25mm` (standard margins).
- Font: `font-sans` inside the paper, `font-mono` in the textarea.
- Shadow + white background for realistic paper feel.

## Route & Access
- Route: `/clinic/settings/document-templates`
- Access: same as existing Document Settings (`adminAccess` — `isAdmin || isSpecialAdmin`).
- Settings card icon: `FileEdit` (Lucide).

## Out of Scope (Future Follow-up)
- Database persistence (`clinic_document_templates` table).
- Rich text editor (bold, logo embed).
- Real patient data injection (currently dummy preview data only).
- Print / PDF export.
