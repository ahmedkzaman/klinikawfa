## Goal
Fix the blank print preview (portal-based isolation), add Edit + Void actions to attached consultation documents, and stabilize print timing.

## 1. Print Preview — `DocumentPrintLayer.tsx`
- Mount `.doc-print-root` via `createPortal(..., document.body)` so it sits as a sibling of `#root`.
- Replace the broad `body > *:not(.doc-print-root)` rule with a surgical one:
  ```css
  @page { size: <size> <orientation>; margin: 0mm; }
  @media print {
    #root, header, nav, aside, footer { display: none !important; }
    .doc-print-root {
      display: block !important;
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      background: white;
    }
  }
  ```
- Inject the `<style>` tag inside the same portal, keep `getPaperStyle()` and `<pre>` content rendering.

## 2. Void (Delete) Documents
- **Migration**: add a DELETE policy on `consultation_documents` using `public.is_ops_or_admin(auth.uid())`.
- **Hook** (`useClinicDocuments.ts`): new `useDeleteConsultationDocument` — `delete().eq('id', id)`, invalidates `['consultation-documents', consultationId]`, toast "Document voided".
- **UI** (`ConsultationDetail.tsx`): add a red ghost Trash icon button per doc, wrapped in `AlertDialog` ("Void this document? This action cannot be undone."). Hidden when `isLocked`.

## 3. Edit Documents
- **Hook**: `useUpdateConsultationDocument` — `update({ content }).eq('id', id)`, invalidates the same query.
- **`IssueDocumentModal`**: add optional `existingDoc?: ConsultationDocument | null` prop.
  - When present: skip tag substitution, seed `content` from `existingDoc.content`, use its `paper_size`/`orientation`, change title to "Edit: {name}", and Save calls the update mutation instead of insert.
  - Otherwise: existing template-issue behavior unchanged.
- **UI**: add a Pencil icon button per doc; new state `editingDoc: ConsultationDocument | null` controls the modal in edit mode. Hidden when `isLocked`.

## 4. Print Reliability
- Bump View/Print `setTimeout` from 100ms → 250ms so the portal + injected `<style>` are flushed before `window.print()`.

## Files Touched
- `src/components/clinic/consultation/DocumentPrintLayer.tsx`
- `src/components/clinic/consultation/IssueDocumentModal.tsx`
- `src/hooks/clinic/useClinicDocuments.ts`
- `src/pages/clinic/ConsultationDetail.tsx`
- New migration: DELETE policy on `consultation_documents`

## Out of Scope
- Soft-delete (table is not in the four soft-deletable clinic tables; uses hard delete).
- Audit log of voided documents.
- Re-substituting tags on edit (intentionally preserves manual edits).
