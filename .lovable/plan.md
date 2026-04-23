
## Step 7 — Frontend Port: Consultation, ConsultationDetail, Procurement

Scope: Port the Clinic Flow consultation workspace into our `/clinic/*` portal. Schema is already aligned. No DB changes. Auth rewired through our `AuthContext`. Out of scope: DispenseCheckout, Billings, Insight.

---

### A. New shared UI primitive

`src/components/ui/combobox-input.tsx` — port verbatim. Uses existing `command.tsx`, `popover.tsx`, `input.tsx`.

### B. Hooks (`src/hooks/clinic/`)

1. **`useConsultations.ts`** — `useConsultation(queueEntryId)`, `useCreateConsultation`, `useUpdateConsultation`, `usePatientConsultationHistory(patientId)`. Realtime subscription.
2. **`useConsultationItems.ts`** — list + add/update/remove (soft-delete with `deleted_by = auth.uid()`). Each mutation catches PG `P0001`/`insufficient_stock` and surfaces `toast.error('Not enough stock available for this item')`.
3. **`useDiagnoses.ts`** — list + CRUD.
4. **`useVitalSigns.ts`** — `useVitalSigns(queueEntryId)`, `useRecordVitalSigns` (upsert), `usePatientVitalHistory(patientId)`.
5. **`useInventoryItems.ts`** — list + CRUD.
6. **`useServices.ts`** — list + CRUD.
7. **`usePackages.ts`** — list + CRUD.
8. **`useCurrentDoctor.ts`** — rewired to `import { useAuth } from '@/contexts/AuthContext'`. Reads `doctors` row where `user_id = auth.uid()`.
9. **`useRooms.ts`** — minimal `useRooms()` returning `id, label` from `rooms` table, ordered by label.
10. **`useClinicAppointments.ts`** — queries `public.clinic_appointments` joined to `doctors` (NOT the public `appointments` lead-form table). Filter by patient_id.
11. **`useClinicPreferences.ts`** — `useClinicPreference(key, default)` reading `clinic_preferences`.
12. **Extend `useQueueEntries.ts`** — add `useConsultationQueueEntries()` returning today's + carry-over active entries joined with `patients(*)`, `doctors:assigned_doctor_id(*)`, `rooms:assigned_room_id(*)`. Add `useUpdateQueueEntry` and `useCallPatient` mutations.

> `QueueEntryWithJoins` in `src/types/clinic.ts` extended to include the rooms join and visit metadata fields (already on `QueueEntryRow`).

### C. Components (`src/components/clinic/`)

1. **`StatusBadge.tsx`** — uses our `STATUS_COLORS` map from `src/types/clinic.ts`. Re-exports `AppointmentStatusBadge` for Procurement.
2. **`consultation/AddTreatmentBulkDialog.tsx`** — port; hooks rewired to `@/hooks/clinic/*`.
3. **`consultation/VitalHistoryTrends.tsx`** — recharts (already installed). RLS already restricts mutations to ops/admin.
4. **`consultation/TreatmentItemCard.tsx`** — extracted from Clinic Flow's `ConsultationDetail` for slim page (~400 lines).

### D. Pages (`src/pages/clinic/`)

1. **`Consultation.tsx`** — replaces placeholder `ConsultationsList.tsx`.
   - Tabs: Waiting / Serving / On hold / Dispensary / Completed / All.
   - Filters by `visit_purpose === 'consultation'` and assigned doctor (admin fallback shows all when no doctor profile).
   - "View" → `/clinic/consultation/:queueEntryId`.
   - "Call In" → advances `clinic_status` to `with_doctor` via `useCallPatient`.
   - `isSpecialAdmin` from our AuthContext (no `useHasRole`).

2. **`ConsultationDetail.tsx`** (new).
   - 5-col grid: 3 left (patient info / vitals / consultation notes / upcoming appts) + 2 right (Patient History tab + Treatment Plan tab).
   - Auto-creates consultation row on mount; seeds default consultation-fee item from `clinic_preferences` (`default_consultation_fee_name`, `default_consultation_fee_price`).
   - Vital editor (9 metrics) → `useRecordVitalSigns` upsert.
   - Treatment plan: search + tabs (All/Items/Services/Packages) + `TreatmentItemCard` rows + `AddTreatmentBulkDialog` + running total.
   - "Send to Dispensary" → saves notes/diagnosis, sets `consultation.status='completed'` (DB trigger commits inventory) and `queue_entry.clinic_status='sent_to_dispensary'`, navigates back.
   - "Call In" dropdown → rooms list, sonner success toast `"<Patient> called to <Room>"` (no TV announcement service yet).

3. **`Procurement.tsx`** (new).
   - Tabs: Pending / In Progress / Completed (`sent_to_dispensary`, `dispensing_payment`, `completed`).
   - 5-col grid: Patient / Doctor / Arrived / Status / Actions.
   - "Start Payment" → `dispensing_payment`. "Complete" → `completed`. (No checkout UI yet — that's the next step.)

### E. Routing (`src/App.tsx` + `ClinicLayout.tsx`)

Inside the existing `<Route path="/clinic" …>` block:
- Add 3 lazy-loaded routes (wrapped by existing `ClinicProtectedRoute`):
  - `/clinic/consultation` → `Consultation`
  - `/clinic/consultation/:queueEntryId` → `ConsultationDetail`
  - `/clinic/procurement` → `Procurement`
- Remove `/clinic/consultations` placeholder route and delete `src/pages/clinic/ConsultationsList.tsx`.

Sidebar (`ClinicLayout.tsx`):
- Rename "Consultations" → "Consultation"; href `/clinic/consultation`.
- Add "Procurement" entry below "Dispensary" (icon `ClipboardList`).

> `Dispensary.tsx` placeholder remains — replaced by DispenseCheckout in next step.

---

### Out of scope (next step)
DispenseCheckout, Billings, Insight, Calendar, Reviews, CallerDisplay, ReviewPublic, Settings sub-pages, Inventory CRUD UI, patient profile drill-down, TV `announcementService`.

### Verification

1. `npx tsc --noEmit` passes.
2. Ops user → `/clinic/consultation` lists today's consultation queue; tabs filter correctly.
3. "View" on ready entry → ConsultationDetail loads; vitals + notes + treatment plan render.
4. Add inventory item with qty > available → `toast.error('Not enough stock available …')`.
5. Add service/package via bulk dialog → row appears with correct price.
6. Save vitals → persists + re-renders in trends chart.
7. "Send to Dispensary" → entry leaves Consultation list, appears in Procurement → Pending; inventory committed (verify `stock` & `allocated_quantity` decremented).
8. Procurement: "Start Payment" → In Progress; "Complete" → Completed.
9. Sidebar shows "Consultation" + "Procurement"; special-admin still sees "Voided Records".
10. Mobile (375px): consultation detail stacks columns; treatment cards remain editable.

**Stop after these files. Do not begin DispenseCheckout / Billings.**
