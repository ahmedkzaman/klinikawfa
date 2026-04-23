**Context:** We are executing a massive structural merge to port "Clinic Flow" into the existing `klinikawfa.com` codebase. The architecture has been rigorously stress-tested to ensure zero race conditions, complete audit compliance, and strict RBAC enforcement.

**Execution Constraints:**

- You act as the execution engine. Do not alter, optimize, or skip any steps in the provided blueprint.
- Execute the migrations in the exact literal sequence provided (B.0 through B.5). Order is critical to prevent database crashes.
- Do NOT use an Edge Function for role assignment; use the native Postgres RPC as defined.

Ensure the `intake_appointment_to_queue` RPC utilizes the `SELECT ... FOR UPDATE` row lock exactly as written.  


Plan: Port "Clinic Flow" into klinikawfa.com under `/clinic/*` (Hardened — Final v4)

All prior patches retained. Patch #4 (intake) replaced with an **atomic SECURITY DEFINER RPC** so the appointment-to-queue conversion is a single transactional call.

---

### A. Scope (unchanged)

- Port Clinic Flow's pages, components, hooks, services, and 3 edge functions into `src/pages/clinic/`, `src/components/clinic/`, `src/hooks/clinic/`, `src/services/`, `src/lib/clinic/`.
- Authenticated clinic routes mount under `/clinic/*` behind `ClinicProtectedRoute` (`role IN ('special_admin','operations','admin')`).
- Clinic Flow's `useAuth` dropped; existing Klinik Awfa `AuthContext` reused (widened with `isSpecialAdmin`, `isOpsOrAdmin`).
- Public site, blog, video consultation, HR portal: untouched.

---

### B. Database migrations — strict order

#### B.0 Consolidated Clinic Flow schema

One migration creating all Clinic Flow tables (clinics, patients, queue_entries, consultations, consultation_items, payments, inventory_items, services, packages, doctors, rooms, vital_signs, diagnoses, payment_methods, insurance_providers, feedback_form_fields, stock_takes, stock_take_counts, inventory_locations, inventory_lists), base RLS, FKs, indexes — extracted as cumulative end-state of Clinic Flow's 33 source migrations. Includes `queue_entries.source_appointment_id UUID NULL REFERENCES public.appointments(id)` for forensic linkage.

#### B.1 RBAC extension (FIRST)

1. **Enum extend** (own migration; commit barrier):
  ```sql
   ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'special_admin';
   ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations';
  ```
2. **Tie-safe dedup** (defensive; `UNIQUE(user_id)` already in place).
3. **Helpers** (`SECURITY DEFINER`, `STABLE`, `search_path=public`, `OWNER TO postgres`): `is_special_admin(uuid)`, `is_ops_or_admin(uuid)`, `get_doctor_id_for_user(uuid)`.
4. **Rewrite `admin_assign_role**`: gate on `is_special_admin(auth.uid())`; self-demotion guard; atomic upsert; `OWNER TO postgres`; `REVOKE FROM PUBLIC`; `GRANT EXECUTE TO authenticated`.
5. **Environment-aware bootstrap** — `RAISE WARNING` + `RETURN` if admin email missing (local/CI safe); upserts `special_admin` for `ahmedkzaman@gmail.com` in production.

#### B.2 Soft delete (SECOND) — `consultations`, `consultation_items`, `payments`, `queue_entries`

- Add `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES auth.users(id)`; partial active-row indexes.
- For every existing UNIQUE on these tables (e.g. `consultations.queue_entry_id`), drop standard constraint, replace with partial unique index `WHERE deleted_at IS NULL`.
- DROP every DELETE policy. Append `AND deleted_at IS NULL` to SELECTs. Add special-admin voided-read policy.
- UPDATE policy split: `USING (<predicate> AND deleted_at IS NULL)` / `WITH CHECK (<predicate>)` — permits `NULL → now()` soft-delete transition.

#### B.3 Inventory allocation (THIRD)

- `inventory_items.allocated_quantity INTEGER NOT NULL DEFAULT 0` + `available_quantity(uuid)` SQL helper.
- Three `SECURITY DEFINER` mutators with `SELECT ... FOR UPDATE`: `reserve_inventory` (raises `insufficient_stock` P0001), `commit_inventory`, `release_inventory`.
- Triggers on `consultation_items` (insert/update/soft-delete) and `queue_entries` (status transition guards) for state-driven allocation.

#### B.4 Midnight queue continuity (FOURTH)

- Drop `reset_queue_number_seq()`. Create `safe_reset_queue_number_seq()` — `MAX(queue_number)+1` from active carry-over rows; restarts at 1001 only when queue is fully drained.
- Frontend filter applied uniformly:
  ```sql
  clinic_status IN ('registered','ready_for_doctor','with_doctor',
                    'sent_to_dispensary','dispensing_payment','on_hold')
  OR created_at >= today
  ```

#### B.5 Atomic intake RPC (FIFTH — PATCH #4 revised)

Single transactional call replacing the dual-mutation client flow:

```sql
CREATE OR REPLACE FUNCTION public.intake_appointment_to_queue(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_visit_purpose text,
  p_notes text DEFAULT NULL,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS uuid                       -- returns new queue_entry id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
  v_appt_status text;
BEGIN
  -- Authorization: any clinic operator
  IF NOT (public.is_ops_or_admin(auth.uid()) OR public.is_special_admin(auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- Lock the appointment row to prevent double-intake races
  SELECT status INTO v_appt_status
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF v_appt_status IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt_status = 'checked_in' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN' USING ERRCODE = 'P0001';
  END IF;

  -- Insert queue entry (queue_number assigned by existing default/trigger)
  INSERT INTO public.queue_entries (
    patient_id, visit_purpose, notes, clinic_status,
    source_appointment_id, clinic_id, created_by
  ) VALUES (
    p_patient_id, p_visit_purpose, p_notes, 'registered',
    p_appointment_id, p_clinic_id, auth.uid()
  )
  RETURNING id INTO v_queue_id;

  -- Flip appointment status atomically
  UPDATE public.appointments
  SET status = 'checked_in'
  WHERE id = p_appointment_id;

  RETURN v_queue_id;
END;
$$;

ALTER FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text, uuid)
  TO authenticated;
```

Properties:

- `SELECT ... FOR UPDATE` on the appointment row prevents two staff members from concurrently checking the same patient in twice.
- Both writes commit or both abort — no orphaned `queue_entries` rows pointing at still-`pending` appointments.
- Errors surface as Postgres exceptions the frontend maps to toasts:
  - `ALREADY_CHECKED_IN` → "This appointment was already checked in."
  - `APPOINTMENT_NOT_FOUND` → "Appointment no longer exists."
  - `NOT_AUTHORIZED` → "You don't have permission to check in patients."

---

### C. Frontend integration

- `**src/contexts/AuthContext.tsx**`: widen `AppRole` to `'admin' | 'staff' | 'guest' | 'special_admin' | 'operations'`; add `isSpecialAdmin`, `isOpsOrAdmin`.
- `**src/components/clinic/ClinicProtectedRoute.tsx**`: gates `/clinic/*` on `isOpsOrAdmin || isAdmin || isSpecialAdmin`.
- `**src/App.tsx**`: lazy-load `/clinic/*` routes; `caller` and `review` mount as public.
- `**src/lib/clinic/softDelete.ts**`: helper `softDelete(table, id)` issues `.update({ deleted_at, deleted_by })`.
- All operational queries on the four soft-deletable tables append `.is('deleted_at', null)`.
- `**InventoryItemsList.tsx**`: three columns — Stock / Allocated / Available — sourced from `available_quantity()`.
- Mutation toasts catch `insufficient_stock` (P0001).
- `**UserManagementSettings.tsx**`: replaces direct `user_roles` writes with `supabase.rpc('admin_assign_role', ...)`.
- **Voided records page** (`/clinic/settings/voided-records`): admin-only forensic view.

#### C.1 Appointments → Queue intake bridge (PATCH #4 — atomic)

- `**src/components/clinic/queue/RegisterPatientDrawer.tsx**`: top-of-drawer "Pull from Today's Appointments" button.
- `**src/hooks/clinic/useTodayAppointments.ts**`: SELECT from `appointments` WHERE `preferred_date = CURRENT_DATE` AND `status IN ('pending','confirmed')`, ordered by `preferred_time`.
- **UX flow**:
  1. Staff clicks "Pull from Appointments" → modal lists today's pending/confirmed appointments (name · phone · service · time).
  2. Staff selects one → drawer auto-populates `patient_name`, `phone`, `visit_purpose ← service`, `notes ← message`.
  3. Patient matching: if `patients` row exists with matching phone, pre-select; else create on submit.
  4. On submit, the frontend calls **a single RPC**:
    ```ts
     const { data: queueId, error } = await supabase.rpc('intake_appointment_to_queue', {
       p_appointment_id: appt.id,
       p_patient_id: patientId,
       p_visit_purpose: visitPurpose,
       p_notes: notes,
       p_clinic_id: clinicId,
     });
    ```
  5. Toast errors map to `ALREADY_CHECKED_IN` / `APPOINTMENT_NOT_FOUND` / `NOT_AUTHORIZED` per B.5.
- No second `.update()` from the client — the RPC owns atomicity.

---

### D. Edge functions, dependencies, config

- Port `create-user`, `googleauth`, `hello` to `supabase/functions/`; add `[functions.*]` blocks per source.
- Add to `package.json`: `mykad`, `react-day-picker`, `react-resizable-panels`, `vaul`, `cmdk`, `embla-carousel-react`, `input-otp`, `recharts`, missing `@radix-ui/*` primitives.

---

### E. Migration file order (literal sequence)

```text
1. <ts>_clinic_flow_schema.sql              -- + queue_entries.source_appointment_id
2. <ts>_rbac_enum_extend.sql                -- enum-only; commit barrier
3. <ts>_rbac_helpers_rpc_bootstrap.sql      -- dedup + helpers + admin_assign_role + WARNING bootstrap
4. <ts>_soft_delete.sql                     -- columns + partial unique indexes + RLS USING/CHECK split
5. <ts>_inventory_allocation.sql            -- column, helper, 3 RPCs, 4 triggers
6. <ts>_midnight_queue.sql                  -- safe_reset_queue_number_seq + drop old
7. <ts>_intake_appointment_to_queue.sql     -- atomic intake RPC (FOR UPDATE lock)
```

---

### F. Out of scope

- No edge function for role assignment (RPC only).
- No background/automated sync between `appointments` and `queue_entries` — staff-triggered intake only.
- No bilingual translation of clinic UI in this pass.
- No real-time subscriptions on clinic tables.
- Cross-admin demotion still permitted between `special_admin`s.

---

### Files touched

- **New**: ~80 ported files under `clinic/` namespaces; 3 edge functions; 7 migrations; `ClinicProtectedRoute.tsx`; `lib/clinic/softDelete.ts`; voided-records admin page; `useTodayAppointments` hook; intake-bridge UI inside `RegisterPatientDrawer.tsx`.
- **Edited**: `src/App.tsx`, `src/contexts/AuthContext.tsx`, `package.json`, `supabase/config.toml`.
- **Untouched**: every existing public page, HR portal page, blog, video consultation, gallery.