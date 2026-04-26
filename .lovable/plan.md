# Step 27 — Secure Clinical Attachments

Add staff-uploadable clinical files (labs, photos, PDFs) attached to a consultation, viewable by doctors via short-lived signed URLs from the **private** `visit-attachment` bucket.

---

## A. Database — `consultation_attachments` + Storage RLS

New migration: `supabase/migrations/<ts>_setup_attachments.sql`

```sql
-- 1. Tracking table
CREATE TABLE public.consultation_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  uploaded_by     uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_attachments_consultation
  ON public.consultation_attachments (consultation_id);

ALTER TABLE public.consultation_attachments ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated clinic user (mirrors consultation_items pattern)
CREATE POLICY "attachments_read"
  ON public.consultation_attachments FOR SELECT
  TO authenticated USING (true);

-- Insert: ops/admin only (Dispensary staff + doctors)
CREATE POLICY "attachments_insert"
  ON public.consultation_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- Delete: ops/admin only
CREATE POLICY "attachments_delete"
  ON public.consultation_attachments FOR DELETE
  TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- 2. Storage policies on the EXISTING private bucket 'visit-attachment'
-- (do NOT recreate the bucket — it's already there)
CREATE POLICY "visit_attachment_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'visit-attachment');

CREATE POLICY "visit_attachment_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visit-attachment'
    AND public.is_ops_or_admin(auth.uid())
  );

CREATE POLICY "visit_attachment_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visit-attachment'
    AND public.is_ops_or_admin(auth.uid())
  );
```

**Why storage RLS is included even though the spec didn't list it:** the bucket is private, so without these policies `signedUrl` and `upload` would silently fail for staff. Mirrors the `is_ops_or_admin` pattern already used across the clinic schema.

---

## B. Hooks — `src/hooks/clinic/useAttachments.ts` (new)

```ts
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'visit-attachment';
```

### `useUploadAttachment(consultationId)`
- Mutation accepting a single `File`.
- Pre-flight guards: throw `'No consultation'` if id missing; throw `'File exceeds 5MB limit'` if `file.size > MAX_BYTES`.
- Sanitize the filename (strip path separators, collapse whitespace) and build path: `${consultationId}/${Date.now()}_${safeName}`.
- `supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })`.
- On success, insert into `consultation_attachments` with `file_path`, `file_name` (original), `content_type`, `uploaded_by: auth.uid()`.
- On settled, invalidate `['clinic','attachments', consultationId]`.
- Surface errors via toast on the caller side.

### `useConsultationAttachments(consultationId)`
- `useQuery` keyed `['clinic','attachments', consultationId]`, enabled when id present.
- Select rows ordered by `created_at desc`.
- For each row, call `supabase.storage.from(BUCKET).createSignedUrl(file_path, 60)`.
- Return rows shaped `{ id, file_name, content_type, created_at, signedUrl }`.
- `staleTime: 45_000` so the 60s URLs stay fresh on re-renders without a refetch storm; `gcTime: 60_000`.

---

## C. Dispensary Upload UI — `src/pages/clinic/DispenseCheckout.tsx`

Inject a new `<Card>` titled **"Clinical Attachments (Labs / Photos)"** in the middle column, placed **above the FollowUpScheduler** (so attachments are visible while staff still has the patient at the counter).

UI:
- Local state: `selectedFile: File | null`, controlled `<input type="file" accept="image/*,application/pdf">`.
- Helper text: *"Max 5MB. Images or PDFs."*.
- "Upload" button — disabled when no file selected OR `mutation.isPending`. On click: `mutate(selectedFile)`, then on success reset input + toast `'Attachment uploaded'`. On error toast the message.
- Below the input, an `<ul>` of `useConsultationAttachments(consultation?.id)` rows:
  - Icon: `Image` for `content_type` starting with `image/`, else `FileText` (lucide-react).
  - File name + small `created_at` timestamp.
  - "View" link → `<a href={signedUrl} target="_blank" rel="noopener noreferrer">` styled as a ghost button.
- Empty state: *"No attachments yet."*.

Gracefully renders nothing for the upload control if `!consultation?.id` (defensive — shouldn't happen at this stage of the flow).

---

## D. Doctor History UI — `src/components/patients/PatientProfileSheet.tsx`

(There is no separate `PastVisits.tsx` — the visit history list lives in `PatientProfileSheet`. Confirmed via repo search; only `usePatientVisitHistory` consumer is this sheet.)

For each historical visit row inside the existing `<ul>`:
- Resolve `consultationId = consultation?.id`.
- Render a small **"Attachments"** sub-section (collapsible details element to avoid making each row tall by default) when `consultationId` exists.
- Inside, mount a tiny child component `<VisitAttachmentList consultationId={...} />` (declared in the same file or co-located) that:
  - Calls `useConsultationAttachments(consultationId)`.
  - Renders nothing when zero attachments (so closed visits stay tidy).
  - Otherwise renders icon + name + "View" link list (same icon rule as in C).
- Using a child component keeps the hook call valid (one hook per row) and keeps each row's signed URLs scoped to that row.

To prevent N×60s signed-URL refetches when the doctor scrolls quickly, the hook's 45s `staleTime` already covers re-renders; we additionally only mount the child when the visit has a consultation id.

---

## Files touched
- **NEW**: `supabase/migrations/<ts>_setup_attachments.sql`
- **NEW**: `src/hooks/clinic/useAttachments.ts`
- **EDIT**: `src/pages/clinic/DispenseCheckout.tsx` — inject Attachments card in middle column.
- **EDIT**: `src/components/patients/PatientProfileSheet.tsx` — add `VisitAttachmentList` child + render per visit.

## Out of scope (per execution constraints)
- Multi-file batch uploads.
- Server-side virus scanning.
- Editing/deleting attachments from the UI (delete policy exists in DB but no UI surfaced).
- Image thumbnails / inline previews (links open in a new tab only).