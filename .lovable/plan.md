# Step 26 — Shared Follow-up Scheduler

Build a reusable patient follow-up booking widget that prevents double-booking by checking for existing future appointments before showing the booking form. Inject it into both the doctor's Consultation view and the staff Dispensary Checkout view.

---

## Schema reality check

The clinical scheduling table is **`clinic_appointments`** (not the public `appointments` lead-form table). Columns:
- `appointment_date` (date) and `appointment_time` (time) — **stored as separate columns**, not a combined `appointment_datetime`.
- `doctor_id` (nullable), `patient_id`, `status` (enum `clinic_appointment_status`, default `'scheduled'`), `notes` (text).

Existing reader: `useClinicAppointments(patientId?)` in `src/hooks/clinic/useClinicAppointments.ts`. There is **no** existing `useAppointments.ts` and **no** create mutation yet. We'll extend the existing file rather than create a parallel one (keeps a single source of truth for clinic appointment hooks).

---

## A. Appointment hooks — extend `src/hooks/clinic/useClinicAppointments.ts`

Add two new exports alongside the existing `useClinicAppointments`:

1. **`usePatientFutureAppointments(patientId?: string)`**
   - Query key: `['clinic', 'clinic_appointments', 'future', patientId]`.
   - Enabled only when `patientId` is truthy.
   - Filter: `patient_id = patientId` AND `status <> 'cancelled'` AND the combined `(appointment_date, appointment_time)` is `>= now()`.
   - Because the table splits date/time, we filter `appointment_date >= today` in SQL, then drop today's already-passed slots client-side using the local clock. Order by `appointment_date asc, appointment_time asc`.
   - Joins `doctors:doctor_id(id, name)` so the alert can show who the appointment is with.

2. **`useCreateClinicAppointment()`**
   - `useMutation` that inserts into `clinic_appointments` with `{ patient_id, doctor_id?, appointment_date, appointment_time, notes }` (status defaults to `'scheduled'` server-side).
   - On success: invalidate `['clinic', 'clinic_appointments']` (broad prefix) so both the new "future" key and any list views refresh.
   - Surfaces Postgres errors via the returned `error` for the caller to toast.

No changes needed to `useTodayAppointments` or `useIntakeAppointment`.

---

## B. Shared component — `src/components/clinic/patient/FollowUpScheduler.tsx` (new)

New folder `src/components/clinic/patient/` (none exists yet — clean home for cross-context patient widgets).

**Props:** `{ patientId: string; defaultReason?: string; defaultDoctorId?: string | null }`

**Behavior:**
- Calls `usePatientFutureAppointments(patientId)`.
- While loading: small skeleton row.
- **State 1 — Already booked** (one or more future appointments):
  - Renders `<Alert className="bg-green-50 text-green-900 border-green-200">` with a `CheckCircle2` icon, title "Follow-up scheduled", and description:
    `"Next appointment: <formatted date & time>" + " · " + reason (notes) + (doctor name if present)`.
  - If there are >1 future appointments, append `"+N more"` muted text.
- **State 2 — Needs booking** (no future appointments):
  - Renders `<Card>` titled **"Schedule Follow-up"** with `CalendarPlus` icon.
  - Fields:
    - **Date** — native `<Input type="date">` with `min={today}` (avoids past dates without pulling in a heavy DatePicker; matches the lightweight inline style used elsewhere in clinic).
    - **Time** — native `<Input type="time">`.
    - **Reason** — `<Input>` text, defaults to `defaultReason ?? "Follow-up"`.
    - (Doctor pre-selected via `defaultDoctorId` when provided, but no UI selector in this step — kept simple per the brief.)
  - **Book Appointment** button:
    - Disabled until both date and time are filled.
    - Calls `useCreateClinicAppointment().mutateAsync({...})` with the doctor id from props (or null), then toasts success/error using `sonner`.
    - On success: query invalidation (in the hook) flips the component to State 1 automatically.

The component is fully self-contained — no portal, no parent state required.

---

## C. Inject into Consultation — `src/pages/clinic/ConsultationDetail.tsx`

The page has a 12-col grid (line 504): main work column + a right `<aside>` (lines 684–993) containing patient info / vitals / history cards. There are **no existing Referral or MC cards** in this file (the brief assumed they exist), so we inject the follow-up scheduler at the **bottom of the aside**, immediately before its closing `</aside>` (~line 993). That keeps it in the patient-context column where it belongs.

- Render `<FollowUpScheduler patientId={consultation.patient_id} defaultDoctorId={consultation.doctor_id} />`.
- `patient_id` and `doctor_id` are available on the consultation object already loaded in the page; no extra fetch.

---

## D. Inject into Dispensary Checkout — `src/pages/clinic/DispenseCheckout.tsx`

The page uses a 3-column layout (`lg:grid-cols-[280px_1fr_360px]`). The middle column already holds the Doctor's Instructions alert and the `VisitDetailsColumn` (treatment cart). The "Complete Checkout" button lives in a **fixed bottom bar** (`fixed bottom-0 …`), so "directly above" it in document flow means at the **end of the middle column**, after `<VisitDetailsColumn />`.

- Render `<FollowUpScheduler patientId={consultation?.patient_id ?? entry.patient_id} defaultDoctorId={consultation?.doctor_id ?? entry.doctor_id ?? null} />` at the bottom of the middle column.
- Falls back to the queue entry's patient/doctor when consultation isn't loaded yet (covers the brief network window before consultation query resolves).

---

## Files touched

- **Edit:** `src/hooks/clinic/useClinicAppointments.ts` — add `usePatientFutureAppointments` + `useCreateClinicAppointment`.
- **New:** `src/components/clinic/patient/FollowUpScheduler.tsx`.
- **Edit:** `src/pages/clinic/ConsultationDetail.tsx` — import + inject in aside.
- **Edit:** `src/pages/clinic/DispenseCheckout.tsx` — import + inject at bottom of middle column.

## Notes / deviations from brief

1. **Hook file name:** Brief said `useAppointments.ts`; we extend the existing `useClinicAppointments.ts` instead to avoid a parallel file targeting the same table (the public `appointments` table is the lead-capture form, unrelated to clinical scheduling).
2. **No combined datetime column:** Future-appointment filter uses `appointment_date >= today` server-side, with a small client-side prune for today's already-passed slots.
3. **No existing Referral/MC cards** in `ConsultationDetail.tsx`. Injection point is the bottom of the patient-context aside, which is the closest match to the brief's intent.
4. **"Directly above Complete Checkout" in DispenseCheckout** = bottom of the middle (scrolling) column, since the button is in a fixed footer bar.
5. Native `<input type="date|time">` is used (no shadcn DatePicker) to keep the widget lightweight and consistent with other inline clinic forms.
