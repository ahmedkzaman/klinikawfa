## Add Timeslip document type with print support

### 1. Settings — `DocumentTemplateBuilder.tsx`
- Extend `DocType` union to include `'timeslip'`.
- Add `{ value: 'timeslip', label: 'Timeslip (Attendance Slip)' }` to `DOC_TYPES`.
- Add a new TAG_GROUPS row "Time" with tags `{{time_in}}`, `{{time_out}}`.
- Add preview values to `PREVIEW_DICTIONARY`: `'{{time_in}}': '9:00 AM'`, `'{{time_out}}': '10:30 AM'`.
- (No new page/route needed — the builder already supports any type via the dropdown. The Settings > Document Templates page lists all templates of any type.)

### 2. Issue modal — `src/components/clinic/consultation/IssueDocumentModal.tsx`
- Add state `const [timeIn, setTimeIn] = useState('')` and `const [timeOut, setTimeOut] = useState('')`.
- On open (when not editing) auto-fill `timeOut` with current `HH:MM` (24h). Leave `timeIn` blank for the staff to fill.
- Add `formatTime12h(hhmm)` helper that converts `"14:00"` → `"2:00 PM"`; returns `'______'` for empty.
- Extend `substitutions` map with `'{{time_in}}'` and `'{{time_out}}'` using the formatter.
- Re-run substitution whenever `timeIn`/`timeOut` change (add them to the `useEffect` deps), but only for new docs — never overwrite an existing doc the user is editing.
- Conditionally render a 2-column "Time In / Time Out" row of `<Input type="time">` above the editor when `template?.type === 'timeslip'` (hidden when editing an existing non-timeslip doc).
- Reset both states on close.

### 3. Print pipeline — `src/lib/clinic/printDocument.ts`
- Already generic (renders raw text on chosen paper with margins). No branching required; timeslips flow through the same pipeline as MC.
- No `@media print` shell-hiding work needed — printing happens via `pdf.autoPrint()` in a new tab, so the app shell is never in the print frame.

### 4. Re-print from history — `src/pages/clinic/ConsultationDetail.tsx`
- The existing documents list already renders one Print button per `ConsultationDocument` (line ~1035) that calls `printDocument(d)`. Timeslips inherit this automatically — no change needed beyond verifying the row renders for `type === 'timeslip'` (it does; no type filter exists).

### 5. Out of scope
- No DB migration. `consultation_documents.type` is `text` and accepts `'timeslip'` as-is.
- No new print template component; reuse `printDocument.ts`.
- `PatientProfileSheet.tsx` does not list past documents today — not adding one here.

### How to use after deploy
Settings → Document Templates → New → Type "Timeslip", paste the boilerplate from the brief.
