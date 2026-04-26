## Step 28 — Doctor-Side Visibility & History Optimization

You're right about the N+1: mounting `useConsultationAttachments` per visit row would fan out one DB query **plus** a `createSignedUrl` round-trip per attachment, on every sheet open. The plan below decouples the **count badge** (cheap, eager, in the parent query) from the **signed-URL list** (lazy, only on expand).

### A. Data Layer — fold attachment count into the visit-history query

**File:** `src/hooks/patients/usePatientVisitHistory.ts` (the actual location of `usePatientVisitHistory` — the prompt mentioned `usePatients.ts` but the hook lives here)

- Extend the PostgREST select to pull a `count` aggregate on the related `consultation_attachments` rows via the embedded consultation:
  ```
  consultations:consultations!consultations_queue_entry_id_fkey (
    id, doctor_id, diagnosis_text, case_note,
    doctors:doctor_id ( id, name ),
    consultation_attachments ( count )
  )
  ```
- Extend `PatientVisitConsultation` with:
  ```ts
  consultation_attachments?: { count: number }[] | null;
  ```
- Add a small helper exported from the hook:
  ```ts
  export function getAttachmentCount(c: PatientVisitConsultation | null): number {
    return c?.consultation_attachments?.[0]?.count ?? 0;
  }
  ```
- Single round-trip — no extra hooks, no per-row queries.

### B. Optimized History UI — collapsible rows with deferred signed-URL fetch

**File:** `src/components/patients/PatientProfileSheet.tsx`

- Extract a new `<VisitRow row={row} />` sub-component:
  - Local `const [isExpanded, setIsExpanded] = useState(false)`.
  - Header is a `<button type="button">` covering the date / queue-number / status row, toggling `isExpanded`. Add a `ChevronDown` / `ChevronUp` indicator.
  - Compute `attachmentCount = getAttachmentCount(consultation)`.
  - If `attachmentCount > 0`, render a small `<Badge variant="secondary">` next to the date with `<Paperclip className="h-3 w-3 mr-1" /> {attachmentCount}` — no hook needed for this, it comes from the parent query.
  - Notes preview stays in the collapsed view (truncated `line-clamp-2`).
  - **Only when `isExpanded === true`**, render the existing `<VisitAttachmentList consultationId={consultation.id} />`. This is the key fix: `useConsultationAttachments` mounts **only on demand**, so 30 past visits = 0 signed-URL calls until the doctor clicks one.
- The existing `<VisitAttachmentList>` component is already a clean child wrapper around `useConsultationAttachments` — keep it as-is, just gate its mount behind `isExpanded`.
- Replace the current `visits.map(...)` body with `<VisitRow key={row.id} row={row} />`.

### C. Active Session UI — Session Attachments strip

**File:** `src/pages/clinic/ConsultationDetail.tsx`

- Import `useConsultationAttachments` and `useDeleteAttachment` (see D).
- Inside the Diagnosis/Dispense card (`CardContent` ending around line 548), directly **below** the Dispense Note `Textarea` (after line 546, still inside the same `space-y` wrapper), add a new section:
  ```tsx
  <div className="space-y-1.5">
    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
      Session Attachments
    </Label>
    <SessionAttachmentsStrip consultationId={consultationId} canEdit={canEdit} />
  </div>
  ```
- Build `SessionAttachmentsStrip` as a small inline component (or a sibling file under `src/components/clinic/consultation/`). Behavior:
  - Calls `useConsultationAttachments(consultationId)`.
  - **Empty state:** subtle muted text "No files uploaded yet."
  - **Pill chips:** `flex flex-wrap gap-2`. Each pill is a rounded `bg-slate-50 border` row with:
    - `Paperclip` icon (or `Image` icon when `content_type` starts with `image/`).
    - Truncated filename (`max-w-[180px] truncate`).
    - "View" link (signed URL, `target="_blank"`).
    - Small `Trash` icon button (only when `canEdit`) wired to `useDeleteAttachment` with a `confirm()` guard, showing a `toast.success` on done.
- Doctor reads files staff uploaded in real time; can clean up irrelevant ones.

### D. Hook addition — `useDeleteAttachment`

**File:** `src/hooks/clinic/useAttachments.ts`

- Add a mutation that:
  1. Looks up the row by id (or accepts `{ id, file_path, consultation_id }` — accept the row to avoid an extra fetch).
  2. Calls `supabase.storage.from('visit-attachment').remove([file_path])`.
  3. Deletes the `consultation_attachments` row by id.
  4. Invalidates `['clinic', 'attachments', consultation_id]` **and** `['clinic', 'patient-visit-history']` (so the badge count stays in sync if a doctor deletes from the active session).
- RLS already permits delete for ops/admin (`attachments_delete` policy + `visit_attachment_delete` storage policy added in Step 27), so no migration needed.

### Performance impact

| Scenario | Before this change | After |
|---|---|---|
| Open patient sheet, 30 past visits, 5 with attachments | 30 attachment list queries + ~N signed-URL calls eagerly | 1 visit-history query (count joined), 0 signed-URL calls |
| Doctor clicks 1 visit | (already fetched) | 1 attachment query + signed URLs only for that visit |
| Active consultation | 1 query, signed URLs for current session only | unchanged |

### Files touched

- `src/hooks/patients/usePatientVisitHistory.ts` — add `consultation_attachments(count)` and `getAttachmentCount` helper
- `src/hooks/clinic/useAttachments.ts` — add `useDeleteAttachment`
- `src/components/patients/PatientProfileSheet.tsx` — extract `<VisitRow>`, deferred mount of `<VisitAttachmentList>`, count badge
- `src/pages/clinic/ConsultationDetail.tsx` — Session Attachments strip below Dispense Note

No DB migration required (`consultation_attachments` table, RLS, and storage policies already exist from Step 27).