## Goal
Wire the Document Template Builder into the live consultation flow: persist templates, surface them in the treatment picker, let the doctor edit a substituted copy, and attach finalized documents to the visit.

## Part 1 — Database (single migration)

**`clinic_document_templates`**
- `id uuid pk default gen_random_uuid()`
- `name text not null`
- `type text not null` (memo, referral, prescription, mc, quarantine)
- `content text not null default ''`
- `paper_size text not null default 'A4'` (A4 | A5 | A6)
- `orientation text not null default 'portrait'` (portrait | landscape)
- `is_active boolean not null default true`
- `created_by uuid`, `created_at`, `updated_at` (trigger via `update_updated_at_column`)
- RLS: `SELECT` for `is_staff_or_admin(auth.uid())`; `INSERT/UPDATE/DELETE` for `is_ops_or_admin(auth.uid())`

**`consultation_documents`**
- `id uuid pk default gen_random_uuid()`
- `consultation_id uuid not null references consultations(id) on delete cascade`
- `patient_id uuid not null references patients(id) on delete cascade`
- `template_id uuid references clinic_document_templates(id) on delete set null` (nice-to-have, optional)
- `template_name text not null`
- `type text` (carry from template for filtering/printing)
- `content text not null`
- `paper_size text not null`
- `orientation text not null`
- `created_by uuid`, `created_at timestamptz default now()`
- Indexes on `consultation_id`, `patient_id`
- RLS: `SELECT/INSERT/UPDATE` for `is_staff_or_admin(auth.uid())`; no DELETE policy (immutable record)

## Part 2 — Hooks (`src/hooks/clinic/useClinicDocuments.ts`)
- `useDocumentTemplates()` → all rows where `is_active = true`, ordered by `name`.
- `useConsultationDocuments(consultationId)` → rows for that consultation, newest first; `enabled: !!consultationId`.
- `useAddConsultationDocument()` → mutation accepting `{ consultation_id, patient_id, template_id?, template_name, type, content, paper_size, orientation }`; sets `created_by = auth user id`; invalidates `['consultation-documents', consultation_id]`.
- (Settings page bonus, not strictly required) `useUpsertDocumentTemplate` / `useDeleteDocumentTemplate` so the builder can actually save — currently the Save button only console.logs. Will wire the existing builder's Save button to `useUpsertDocumentTemplate`.

## Part 3 — Treatment Picker (`AddTreatmentBulkDialog.tsx`)
- Import `useDocumentTemplates`.
- Extend `CombinedRow` union with `type: 'document'` carrying `{ id, name, type: 'document', subtitle: docType label }`.
- Map active templates into `allItems` alongside medicines/procedures/packages.
- Add a new tab pill **Documents** with its own count.
- Update `rowMatchesTab` and the count map to include `document`.
- Click handler: when `row.type === 'document'`, instead of toggling into `selected`, call a new prop `onIssueDocument(template)` and close the picker (or stay open — close for clarity). Document rows render without checkbox/qty controls.

## Part 4 — Issue Document Modal (`src/components/clinic/consultation/IssueDocumentModal.tsx`)
Props: `{ isOpen, onClose, template, patient, consultationId }` where `patient` already exists in `ConsultationDetail` (`entry.patients`).

**Substitution map** (use the actual patient field names in this codebase):
```
{{patient_name}}   → patient.name
{{patient_ic}}     → patient.national_id ?? ''
{{patient_phone}}  → patient.phone ?? ''
{{current_date}}   → new Date().toLocaleDateString('en-MY')
{{clinic_name}}    → from useClinicSettings (fallback constant)
{{doctor_name}}    → from useCurrentDoctor (fallback '')
```
Run substitution once on open, store result in local `content` state via `useState(() => substitute(template.content))`.

**UI** (Dialog, `max-w-5xl`):
- Header: template name + paper size / orientation badge.
- Two-column body (stack on mobile):
  - Left: `<Textarea>` bound to `content`, monospace, full height.
  - Right: paper preview reusing the same dynamic `maxWidth` / `aspectRatio` math from `DocumentTemplateBuilder` — extract a tiny shared helper `getPaperStyle(paperSize, orientation)` into `src/lib/clinic/paperStyle.ts` so the modal and the builder share it. Preview shows the substituted text (no shortcode highlights here — values are real).
- Footer: **Cancel** + **Save to Consultation** → calls `useAddConsultationDocument`, toasts success, closes modal. Print button optional (out of scope).

## Part 5 — Treatment Plan UI (`ConsultationDetail.tsx`)
- Wire `<AddTreatmentBulkDialog onIssueDocument={tpl => setIssuingTemplate(tpl)} />`.
- Render `<IssueDocumentModal>` controlled by `issuingTemplate` state, passing `patient` and `consultationId`.
- Below the existing Treatment Plan list (around line ~847), add an **Attached Documents** section:
  - `useConsultationDocuments(consultationId)`.
  - Empty state: muted "No documents attached".
  - Each row: doc name + type badge + created timestamp + **View / Print** button. View opens a lightweight read-only dialog rendering the saved content inside the same paper preview container; Print uses `window.print()` after rendering into a print-only container (or `react-to-print` if already in deps — otherwise simple `window.open` + `document.write`).

## Technical notes / decisions
- Patient fields in this project are `name`, `national_id`, `phone` (not `full_name` / `ic_number` from the prompt). Substitution map adjusted accordingly.
- Shared `getPaperStyle` helper avoids duplicating dimension math between builder, issue modal, and viewer.
- Saved documents are immutable: no edit-after-save UI in this pass; admins can void via DB if needed.
- Hooking the builder's existing console.log Save into `useUpsertDocumentTemplate` is included so templates fetched in Part 3 actually exist.

## Out of scope
- PDF export / e-signing / letterhead branding pass.
- Per-doc-type starter content presets in the builder.
- Versioning of templates.
