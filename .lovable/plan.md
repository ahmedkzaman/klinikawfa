
## Step 5 — Clinic Portal Data Wiring (Queue + Patients + Voided Records)

Scope: Replace three of the six placeholder pages with real, working UIs backed by the database primitives from Steps 1–2. Consultations, Dispensary, and Inventory remain placeholders — they involve the most complex flows (consultation editor, dispense + inventory commit, stock CRUD) and will be Step 6 / 7 / 8 to keep this step reviewable.

The three pages chosen for Step 5 form a complete intake-and-audit loop:
1. **Patients** — registration + lookup (prerequisite for queue intake).
2. **Queue Board** — live board powered by `intake_appointment_to_queue` RPC + realtime.
3. **Voided Records** — exercises `fetchVoided` and proves the special_admin RLS gate.

---

### 5.1 — Shared clinic types + query hooks

New file: `src/types/clinic.ts`

- Re-export commonly used row shapes from `Database['public']['Tables']` for `patients`, `queue_entries`, `appointments`, `consultations`, `consultation_items`, `payments` — gives clinic components a single import surface and makes Step 6/7/8 easier.
- Define `ClinicStatus` as a string-literal union mirroring the DB enum: `'registered' | 'ready_for_doctor' | 'with_doctor' | 'sent_to_dispensary' | 'dispensing_payment' | 'on_hold' | 'completed' | 'cancelled'`.
- Define `STATUS_LABELS` and `STATUS_COLORS` maps (semantic-token classes only — `bg-primary/10`, `bg-muted`, `bg-destructive/10`, etc.).

New file: `src/hooks/clinic/useQueueEntries.ts`

- `useQueueEntries()` — `useQuery` returning today's active queue entries (clinic_status not in `('completed','cancelled')`, `deleted_at IS NULL`), joined with `patients(name, phone)` and `doctors(name)`.
- Subscribe to `postgres_changes` on `queue_entries` and invalidate the query on any event. Channel cleanup on unmount.
- Sort: urgent first, then `queue_number` ascending.

New file: `src/hooks/clinic/usePatients.ts`

- `usePatients(search?: string)` — `useQuery` keyed by search term. Empty search returns 50 most recent; non-empty does case-insensitive `ilike` match on `name`, `phone`, `national_id`.
- `useCreatePatient()` — `useMutation` wrapping `supabase.from('patients').insert(...)`. Invalidates `['patients']` on success.

New file: `src/hooks/clinic/useTodayAppointments.ts`

- Returns today's appointments with `status = 'pending'` (i.e., not yet checked in) — feeds the "Check In" picker on the queue board.

---

### 5.2 — Patients page (real UI)

Rewrite `src/pages/clinic/PatientsList.tsx`:

**Layout:** header row with title + "Register Patient" primary button, search input below (debounced 250ms), then results table.

**Table columns:** Name, Phone, National ID, DOB, Gender, Registered (date), row-action menu (`…` → "View profile" — Step 6 will wire profile drill-down; for Step 5 it's a stub that toasts "Coming soon").

**Empty state:** When search returns zero results, show inline `<Card>` with "No patients found — register a new one?" + button that opens the same dialog as the header button.

**Register dialog:** shadcn `Dialog` containing a react-hook-form + zod-validated form:
- Required: `name` (min 2), `phone` (Malaysian-mobile regex from `src/lib/validations.ts`).
- Optional: `national_id` (12-digit MyKad regex if provided), `date_of_birth` (date picker), `gender` (select: male/female/other), `email`, `allergies` (textarea), `underlying_conditions` (textarea).
- Submit calls `useCreatePatient`; on success closes dialog, toasts, and refocuses the new patient in the table.

**Search performance:** Hook handles debounce; component renders skeleton rows during fetch. No client-side filtering — all queries go through the DB.

**Accessibility:** Form labels associated, dialog focus-trapped (shadcn handles), table has caption.

---

### 5.3 — Queue Board page (real UI)

Rewrite `src/pages/clinic/QueueBoard.tsx`:

**Top bar:** Date label (today), "Check In Walk-In" secondary button, "Check In Appointment" primary button (disabled if no pending appointments today).

**Layout:** Five horizontal status columns (kanban-style), responsive — 5 cols on `xl`, 3 on `lg`, 1 stacked accordion on mobile:
1. Registered
2. Ready for Doctor
3. With Doctor
4. Dispensary / Payment (groups `sent_to_dispensary` + `dispensing_payment`)
5. On Hold

Each column shows:
- Header with status label + count badge.
- Card per entry: queue number (large, monospace), patient name, time waited (live, computed from `created_at`), urgency flag (red dot if `is_urgent`), assigned doctor name if any, visit purpose chip.
- Card click opens a side `Sheet` with full details (patient info, visit notes, timeline) — actions (Call Next / Send to Doctor / Mark Done) are stubbed for Step 5 with a "Wired in Step 6" toast. The card itself is informational this step.

**Realtime:** Cards animate in/out as the realtime subscription pushes changes. Use `framer-motion`'s `AnimatePresence` for column transitions.

**"Check In Appointment" flow:**
- Opens dialog listing today's pending appointments (from `useTodayAppointments`).
- Each row: patient name, time, service, "Check In" button.
- Button calls a new `useIntakeAppointment` mutation that wraps `supabase.rpc('intake_appointment_to_queue', { p_appointment_id, p_patient_id, p_visit_purpose, p_notes })`.
- The RPC needs `p_patient_id`. Appointments don't link to patients directly, so the dialog includes a patient picker (search-as-you-type, reuses `usePatients`) per appointment row — operator confirms which `patients` row matches the walk-in. If no match exists, a "Register first" link opens the patient registration dialog inline.
- On success: toasts `Queue #{n} created`, closes dialog. Realtime pushes the new card.

**"Check In Walk-In" flow:**
- Single dialog: patient picker (required) + visit purpose select + notes textarea.
- Inserts directly into `queue_entries` (no appointment link). The DB trigger assigns `queue_number` from the sequence.

**Empty queue state:** Centered illustration-style message in the column area: "No active patients. Check in an appointment or walk-in to get started."

---

### 5.4 — Voided Records page (real UI, special_admin only)

Rewrite `src/pages/clinic/VoidedRecords.tsx`:

**Layout:** Tabs for the four soft-deletable tables: Consultations | Items | Payments | Queue Entries.

Each tab renders a table powered by `fetchVoided(table)` (already exists in `src/lib/clinic/softDelete.ts`). Columns vary per table but all include `deleted_at` (relative time + absolute on hover), `deleted_by` (resolved to profile email via a join — fall back to UUID if join fails), and a "View original" details popover.

**No mutation surface** — voided records are read-only audit history. Step 6+ may add an "Unvoid" RPC for special_admin; out of scope here.

**Gate:** Page is already wrapped in `<ClinicProtectedRoute requiredRole="special_admin">` from Step 4 — no additional client-side check needed. RLS guarantees non-special-admins receive `[]` even if they bypass the route guard.

**Empty state:** Per-tab message: "No voided {entity} yet."

---

### 5.5 — Inventory column reveal (Stock / Allocated / Available)

Touch the **existing** inventory admin page if one exists, OR add a minimal read-only table to `src/pages/clinic/Inventory.tsx`:

- Three columns: Stock, Allocated, Available (computed client-side as `stock - allocated_quantity`, capped at 0).
- This proves the B.3 inventory-allocation primitive is live and visible. Full inventory CRUD remains a future step.
- If `src/pages/admin` already has inventory pages, defer to Step 7 instead and keep `Inventory.tsx` as placeholder — I'll check during implementation and report which path was taken.

---

### Out of scope for Step 5

- Consultation editor (chief complaint, diagnosis, items, dispense note) — Step 6.
- Dispense flow + payment capture + e-invoice trigger — Step 7.
- Inventory CRUD (add/edit/delete items, expiry tracking, stock adjustments) — Step 8.
- Edge functions (`einvoice-submit`, `intake-bridge`).
- Doctor-facing "with patient" room view.
- Unvoid / restore RPC.
- Bulk operations (multi-select on patients/queue).

### Verification after Step 5

1. TypeScript compiles cleanly.
2. Operations user can register a patient, see them in the search results.
3. Operations user can check in a pending appointment → queue card appears in real time on a second browser tab.
4. Operations user can check in a walk-in → queue card appears with auto-assigned queue number.
5. Soft-deleting a queue entry via DB (`UPDATE queue_entries SET deleted_at = now(), deleted_by = '<id>' WHERE …`) → card disappears from queue board within 1s; appears in Voided Records for special_admin.
6. Non-special admin loading `/clinic/voided` directly → redirected to `/staff/dashboard`.
7. Special admin sees four tabs of voided data.
8. Mobile (375px): queue board stacks columns into accordion; patient table scrolls horizontally.

**Stop after these files. Do not begin Step 6 (Consultation editor).**
