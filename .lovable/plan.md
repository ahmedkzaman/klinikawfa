## Add remarks to clinical attachments

### 1. Database migration
Add nullable `remark` column to `public.consultation_attachments`:
```sql
ALTER TABLE public.consultation_attachments ADD COLUMN IF NOT EXISTS remark text;
```

### 2. Hook (`src/hooks/clinic/useAttachments.ts`)
- Add `remark: string | null` to `ConsultationAttachment` interface.
- Include `remark` in the SELECT list of `useConsultationAttachments`.
- Change `useUploadAttachment` mutation to accept `{ file: File; remark?: string | null }` instead of `File`, and insert `remark: remark?.trim() || null` into the row payload.

### 3. Upload UI (`src/components/clinic/visit/AttachmentsCard.tsx`)
- Add `const [remark, setRemark] = useState('')`.
- Insert a text `Input` placeholder "Add a description or remark (optional)…" below the file-picker row.
- In `handleUpload`, pass `{ file: selectedFile, remark }` to the mutation and clear `setRemark('')` on success.

### 4. Rendered list
- In `AttachmentsCard.tsx`, render `{a.remark && <p className="text-xs text-muted-foreground italic mt-0.5">{a.remark}</p>}` under the filename.
- Do the same in `src/components/clinic/consultation/SessionAttachmentsStrip.tsx` (compact pill: show remark as a tooltip/title and append a small text after the filename if present).

### Out of scope
- 5MB limit and accept filter unchanged.
- No styling overhaul.
