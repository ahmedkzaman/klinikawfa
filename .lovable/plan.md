## Appointment Rescheduling & Retroactive Documents

### Part 1 — Reschedule appointments

**`src/pages/clinic/Appointments.tsx`** (only file touched for Part 1)

In `AppointmentDetailsSheet`, add a "Reschedule" action that opens a small inline `Dialog`:

- Trigger: `<Button variant="outline">` with `<CalendarDays />` icon, placed in the action-button group above "Cancel Appointment".
- Visibility: hidden if `appt.status` is `completed` or `cancelled`.
- Dialog body:
  - Shadcn `<Calendar mode="single">` inside a `Popover` (per project datepicker convention with `pointer-events-auto`) — pre-selected to `appt.appointment_date`.
  - `<Input type="time">` pre-filled with `appt.appointment_time.slice(0,5)`.
  - "Save" and "Cancel" buttons in the dialog footer.
- Submit handler reuses the existing `useUpdateClinicAppointment()` mutation (already supports `appointment_date` + `appointment_time` and invalidates the `['clinic','clinic_appointments']` query family). On success: toast "Appointment rescheduled", close the dialog, and close the sheet (so the calendar re-renders with the new slot).

No hook changes are needed — `useUpdateClinicAppointment` in `src/hooks/clinic/useClinicAppointmentsRange.ts` already accepts these fields and invalidates correctly.

### Part 2 — Retroactive document issuance

**`src/pages/clinic/ConsultationDetail.tsx`** (only file touched for Part 2)

The Attached Documents card lives at lines ~1015–1076. Currently when `isLocked === true` only "View / Print" is shown.

Changes:
1. Header row of the card: add an **"Issue New Document"** primary button next to the `ATTACHED DOCUMENTS` title. Always visible (this is the retroactive entry point).
2. Add a small **template-picker `Dialog`** opened by that button:
   - Lists active templates from existing `useDocumentTemplates()` hook (already in `useClinicDocuments.ts`).
   - Each row is a button showing template name + type + paper size; clicking it closes the picker and sets `setIssuingTemplate(tpl)`.
3. Reuse the **same `IssueDocumentModal`** that's already mounted at line 1392 — no new modal, no prop changes. It already receives:
   - `consultationId={consultationId ?? null}` → the historical consultation id
   - `patient={...}` → the patient object
   - `template={issuingTemplate}` → the chosen template
   The existing `useAddConsultationDocument` mutation writes against this `consultation_id` and invalidates `['consultation-documents', consultationId]`, so the new document appears in the list instantly without extra refetch wiring.

### Out of scope
- No DB schema changes.
- No new modal component for retroactive documents.
- The `appointments` (public lead-form) table is untouched; rescheduling targets `clinic_appointments`, which is what the calendar reads.
