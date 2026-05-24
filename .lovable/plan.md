## Problem

`DocumentTemplates` only renders the **builder** (a blank-slate creator). There is no list of saved templates, no way to load one into the editor, and no delete. So once a template is saved, you can never reopen it — only create new ones.

## Fix

Turn `DocumentTemplateBuilder` into a two-pane manager: a list of saved templates on the left, the existing editor on the right.

### 1. Load saved templates
- Use existing `useDocumentTemplates()` hook to fetch all active templates.
- Show them as a vertical list (name + type badge + paper size). Highlight the active one.
- Add a "+ New Template" button at the top of the list that resets the editor to a blank draft.

### 2. Make the editor edit-aware
- Track `editingId: string | null` in state.
- Clicking a template loads its `name`, `type`, `content`, `paper_size`, `orientation` into the editor state and sets `editingId`.
- `handleSave` passes `id: editingId ?? undefined` to `useUpsertDocumentTemplate` so it updates instead of inserting a duplicate. After a successful insert, capture the returned `id` and set it as `editingId` so subsequent saves update the same row.
- Header title shows "Editing: {name}" vs "New Template" based on `editingId`.

### 3. Delete + duplicate
- Add a new `useDeleteDocumentTemplate` hook (soft delete via `is_active=false`, since the table already has that flag — keeps historical `consultation_documents.template_id` links intact).
- Row actions on hover: **Duplicate** (loads values but clears `editingId` so Save creates a new row with " (copy)" appended) and **Delete** (confirm dialog → soft delete → toast).

### 4. Layout
- Three columns on large screens: `[templates list 280px] [editor] [paper preview]`. Stack vertically below `lg`.
- List uses the same slate/white styling as the rest of the builder.

## Files touched

- `src/components/clinic/settings/DocumentTemplateBuilder.tsx` — add list pane, load/duplicate/delete handlers, edit-aware save.
- `src/hooks/clinic/useClinicDocuments.ts` — add `useDeleteDocumentTemplate` (soft delete) and make `useUpsertDocumentTemplate.onSuccess` return the saved row so the caller can pick up the new `id`.

## Out of scope

- No DB migration. `clinic_document_templates` already has `id`, `is_active`, and the upsert path; existing RLS for staff/admin already covers update + soft-delete.
- No change to `IssueDocumentModal` or the dispensary/consultation document panels.