## Per-Visit Remarks (Lifecycle Triage Notes)

### Discovery
- `queue_entries` does **not** have `visit_remarks` yet → migration needed.
- `useQueueEntries` already does `select('*')`, so once the column exists and types regenerate, the field flows through automatically. Both `ConsultationDetail.tsx` and `DispenseCheckout.tsx` derive `entry` from `useQueueEntries`, so no per-page fetch changes are required.
- Queue card is rendered inline in `src/pages/clinic/QueueBoard.tsx` (no separate `QueueCard.tsx` file). Patient name renders at lines 81–83.
- `PatientAlertBanner` is the visual pattern to mirror. Insertion points: `ConsultationDetail.tsx` ~line 836 and `DispenseCheckout.tsx` ~line 294.

### 1. Migration
```sql
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS visit_remarks text;
```
Types regenerate automatically.

### 2. `RegisterAndCheckInDialog.tsx`
- Add `const [visitRemarks, setVisitRemarks] = useState('');` and reset to `''` in the existing close-effect (alongside `setAssignedDoctorId(null)`).
- In the "Today's Visit" card, **above** the new "Assign Doctor" Select, render a `<Textarea>` labeled **"Visit Purpose / Remarks (e.g., Typhoid Vaccine, Medical Checkup)"** bound to `visitRemarks`. Render for both `consultation` and `direct_sale` visit types (front-desk note applies to OTC too — that's the user's primary scenario).
- In the `queue_entries.insert(...)` payload, add `visit_remarks: visitRemarks.trim() || null`.

### 3. Queue board card (`QueueBoard.tsx`)
- Directly under the patient-name `<p>` (line 81–83), conditionally render:
  ```tsx
  {entry.visit_remarks && (
    <p className="mt-0.5 flex items-center gap-1 text-xs italic text-muted-foreground truncate">
      <MessageSquare className="h-3 w-3 shrink-0" />
      <span className="truncate">{entry.visit_remarks}</span>
    </p>
  )}
  ```
- Import `MessageSquare` from `lucide-react`.

### 4. New reusable banner — `src/components/clinic/VisitRemarksBanner.tsx`
- Props: `{ remarks?: string | null }`. Returns `null` if empty/whitespace.
- Uses shadcn `<Alert>` with classes `bg-slate-50 border-slate-200 text-slate-800`, `ClipboardList` icon, title **"Today's Visit Remarks"**, description rendered with `whitespace-pre-wrap`.

### 5. Doctor & Dispensary screens
- `ConsultationDetail.tsx`: add `<VisitRemarksBanner remarks={entry?.visit_remarks} />` directly after the existing `<PatientAlertBanner …/>` (~line 836).
- `DispenseCheckout.tsx`: same — add directly after `<PatientAlertBanner …/>` (~line 294).
- No fetch changes (entry already carries `visit_remarks` via `useQueueEntries` select `*`).

### Out of scope
- Editing remarks after check-in (display-only on doctor/dispensary).
- Showing remarks on the TV queue board, walk-in dialog, intake-from-appointment flow, or appointment booking. (Easy to layer later — same field.)
