## Sprint 1 — 4 Operational Tasks

### Task 1: Rename Procurement → Dispensary, add Procurement placeholder

**Files**
- `src/pages/clinic/Procurement.tsx` → rename to `src/pages/clinic/Dispensary.tsx`. Update component name `Procurement` → `Dispensary`, h1 "Procurement" → "Dispensary", description copy → "Open a patient to dispense items and process payment."
- `src/pages/clinic/Procurement.tsx` (NEW placeholder) — uses `ClinicPlaceholder` from `_Placeholder.tsx` with title "Procurement Engine", description "Supply chain module coming in Sprint 2.", icon `Package`.
- `src/App.tsx` — add `import Dispensary`. Add new route `<Route path="dispensary" element={<Dispensary />} />`. Keep `procurement` route but point at the new placeholder.
- `src/components/clinic/ClinicLayout.tsx` (line 37) — change sidebar entry to `{ href: '/clinic/dispensary', label: 'Dispensary', icon: Pill }` and add a new entry below it `{ href: '/clinic/procurement', label: 'Procurement', icon: ClipboardList }`.
- `src/pages/clinic/DispenseCheckout.tsx` (lines 106, 137, 139, 160) — replace `/clinic/procurement` navigations and the "Back to Procurement" label with `/clinic/dispensary` / "Back to Dispensary".

(No DB changes. The onboarding views' generic "procurement / purchasing" copy stays — unrelated to the route.)

### Task 2: Bulk "Mark as Submitted" on Panel Claims

**File:** `src/pages/clinic/PanelClaims.tsx`
- Add a left-most checkbox column. Increment `COLUMN_COUNT` (10 → 11). Header gets a "Select All" checkbox bound to the currently visible `rows` (intermediate state when partially selected).
- Local state `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`. Reset on tab/page change.
- Each `ClaimRow` receives `isSelected` + `onToggle`; checkbox cell uses `e.stopPropagation()` so clicking it doesn't open the details sheet.
- Inline action bar inside the table card (above the table, shown when `selectedIds.size > 0`): shows "{n} selected", a "Clear" button, and a primary **"Mark as Submitted"** button.
- New mutation hook `useBulkMarkClaimsSubmitted` in `src/hooks/clinic/usePanelClaims.ts`:
  ```ts
  await supabase.from('panel_claims')
    .update({ status: 'submitted', submitted_date: new Date().toISOString().slice(0,10) })
    .in('id', ids);
  ```
  On success: invalidate `['clinic','panel-claims']` query keys, `toast.success("{n} claims marked as submitted")`, clear selection.
- Confirm `panel_claims` has `submitted_date` column; if missing, add a migration `ALTER TABLE public.panel_claims ADD COLUMN IF NOT EXISTS submitted_date date;` (will be checked at implementation; column likely already exists since the codebase already filters by submitted status).

### Task 3: Redesign past-visit notes in `PatientProfileSheet`

**Files**
- `src/hooks/patients/usePatientVisitHistory.ts` — extend the select to also pull `dispense_note` from consultations and a nested `consultation_items` list with `item_name, quantity, price, price_tier` (active only — `deleted_at is null`). Update `PatientVisitConsultation` interface accordingly.
- `src/components/patients/PatientProfileSheet.tsx` `VisitRow` (lines 109-187) — restructure expanded section into 4 stacked blocks:
  1. **Header** (already in collapsed bar): date · queue#, doctor name, plus diagnosis pill(s) rendered from `consultation.diagnosis_text` (split on comma/semicolon → `Badge`s).
  2. **Clinical Notes** — `case_note`/`diagnosis_text` rendered with `whitespace-pre-wrap` and a small "Clinical Notes" label.
  3. **Dispense Notes** — only if `dispense_note` exists; wrapped in `bg-slate-50 border-l-4 border-blue-200 pl-4 py-2 my-2 rounded-r` with a "Dispense Notes" label and `whitespace-pre-wrap` body.
  4. **Billing Items** — compact `<table>` (Item · Qty · Price · Subtotal). Empty state: small muted "No billed items".
- Attachments list stays at the bottom.

### Task 4: Allow concurrent (multiple future) appointments

**Where the restriction lives:** `src/components/clinic/patient/FollowUpScheduler.tsx` (lines 50-81). When `future.length > 0`, the booking form is hidden behind a green "already scheduled" alert — that's the single-active-appointment block. No DB constraint or Zod rule enforces it (verified: `clinic_appointments` has only PK + FKs, and `appointmentSchema` in `src/lib/validations.ts` has no patient-uniqueness rule).

**Change:** Always render the booking form. When `future.length > 0`, render the existing green alert *above* the form as an informational summary (list up to 3 upcoming appointments with date/time/doctor) instead of replacing the form. Update `usePatientFutureAppointments` invalidation isn't needed — the create mutation already invalidates the right key.

No migration required.

### Out-of-scope checks performed
- `Appointment.tsx` (public lead form) and `submit-appointment` edge function don't enforce per-patient uniqueness — nothing to remove there.
- `record_appointment_submission` RPC only rate-limits per IP; safe.

### Technical sequencing
1. DB: quick verification that `panel_claims.submitted_date` exists; migration only if missing.
2. Task 1 file rename + route + sidebar.
3. Task 2 hook + UI.
4. Task 3 hook extension + UI restructure.
5. Task 4 FollowUpScheduler edit.
