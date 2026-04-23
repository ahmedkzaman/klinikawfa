
## Step 1 — Database Hardening (B.1 + B.2)

Scope: SQL migrations only. No frontend changes. Stop and confirm after both migrations apply cleanly.

---

### Migration 1 — `<ts>_rbac_enum_extend.sql`

Enum-only migration (commit barrier required before new values can be referenced).

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'special_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations';
```

---

### Migration 2 — `<ts>_rbac_helpers_rpc_bootstrap.sql`

**Tie-safe dedup** (defensive; `UNIQUE(user_id)` already in place):
```sql
WITH ranked AS (
  SELECT ctid, user_id, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY CASE role
      WHEN 'special_admin' THEN 4 WHEN 'admin' THEN 3
      WHEN 'operations' THEN 2 ELSE 1 END DESC,
      ctid ASC
  ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur USING ranked r
WHERE ur.ctid = r.ctid AND r.rn > 1;
```

**Helpers** — `SECURITY DEFINER`, `STABLE`, `search_path=public`, `OWNER TO postgres`:
- `is_special_admin(_user_id uuid) → boolean`
- `is_ops_or_admin(_user_id uuid) → boolean` (true for `operations` / `admin` / `special_admin`)
- `get_doctor_id_for_user(_user_id uuid) → uuid` (looks up `doctors.id` where `user_id = _user_id`)

**Rewrite `admin_assign_role`** — gate on `is_special_admin(auth.uid())` instead of `is_admin`; keep self-demotion guard (block `target = auth.uid() AND new_role <> 'special_admin'`); atomic upsert; `OWNER TO postgres`; `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO authenticated`.

**Backfill write RLS on the new clinic tables** using `is_ops_or_admin`. Apply INSERT/UPDATE policies (no DELETE — those four tables get soft-delete in Migration 3) to:
- `patients`, `doctors`, `inventory_items`, `inventory_item_prices`, `inventory_lists`, `inventory_locations`, `packages`, `diagnoses`, `panel_payment_methods`, `insurance_providers`, `clinic_appointments`, `clinic_preferences`, `clinic_feedback_form_fields`, `consultation_transcripts`, `einvoices`, `einvoice_credentials`, `google_business_tokens`, `consultations`, `consultation_items`, `payments`, `queue_entries`.
- DELETE policies added only for non-soft-delete tables (e.g. `patients`, `doctors`, inventory tables).
- `einvoice_credentials` and `google_business_tokens` restricted to `is_special_admin` only.

**Environment-aware bootstrap** (non-fatal, local/CI safe):
```sql
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'ahmedkzaman@gmail.com';
  IF v_uid IS NULL THEN
    RAISE WARNING 'Bootstrap bypassed: Admin email not found in auth.users (Expected in local dev).';
    RETURN;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'special_admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'special_admin';
END $$;
```

---

### Migration 3 — `<ts>_soft_delete.sql` (B.2)

Applied to **`consultations`, `consultation_items`, `payments`, `queue_entries`**.

**Schema:**
```sql
ALTER TABLE public.<t>
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by UUID NULL REFERENCES auth.users(id);
CREATE INDEX <t>_active_idx ON public.<t> (<hot_col>) WHERE deleted_at IS NULL;
```

Hot columns indexed:
- `consultations(queue_entry_id)`, `consultations(patient_id)`
- `consultation_items(consultation_id)`
- `payments(queue_entry_id)`, `payments(consultation_id)`
- `queue_entries(clinic_status)`, `queue_entries(created_at)`

**Partial unique indexes** — for every existing UNIQUE on these four tables (audited from B.0 schema during migration; notably `consultations.queue_entry_id` if present), drop the standard constraint and replace:
```sql
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_queue_entry_id_key;
CREATE UNIQUE INDEX consultations_queue_entry_id_active_uidx
  ON public.consultations (queue_entry_id) WHERE deleted_at IS NULL;
```
Repeat for any other UNIQUE on the four tables. Rule: "one X per Y" → "one *active* X per Y".

**RLS rewrite per table:**
1. DROP every existing DELETE policy. DB-level deletion is forbidden going forward.
2. DROP and recreate every SELECT policy with `AND deleted_at IS NULL` appended to its predicate. Keep the existing `Authenticated can read <t>` policies semantically intact.
3. Add separate special-admin voided-read policy:
   ```sql
   CREATE POLICY "<t>_special_admin_read_voided" ON public.<t>
     FOR SELECT TO authenticated
     USING (public.is_special_admin(auth.uid()) AND deleted_at IS NOT NULL);
   ```
4. UPDATE policy split (USING vs WITH CHECK) so soft-delete transition is permitted:
   ```sql
   CREATE POLICY "<t>_update_active" ON public.<t>
     FOR UPDATE TO authenticated
     USING  (public.is_ops_or_admin(auth.uid()) AND deleted_at IS NULL)
     WITH CHECK (public.is_ops_or_admin(auth.uid()));
   ```
   USING gates *which rows* may be targeted (active only). WITH CHECK validates the *post-update row* — intentionally omits `deleted_at IS NULL` so a `NULL → now()` transition succeeds. Hard updates of already-soft-deleted rows remain blocked by USING.
5. INSERT policy (was missing): `WITH CHECK (public.is_ops_or_admin(auth.uid()))`.

---

### Execution order

```text
1. <ts>_rbac_enum_extend.sql           -- enum-only; commit barrier
2. <ts>_rbac_helpers_rpc_bootstrap.sql -- dedup + helpers + admin_assign_role + write RLS backfill + WARNING bootstrap
3. <ts>_soft_delete.sql                -- columns + partial unique indexes + RLS USING/CHECK split
```

After all three apply: run the Supabase linter, confirm zero new criticals, and report success. **Stop. Do not begin Step 2 (B.3/B.4/B.5) or any frontend work.**

### Out of scope for Step 1

- B.3 inventory allocation, B.4 midnight queue, B.5 atomic intake RPC.
- Any frontend file (`App.tsx`, `AuthContext.tsx`, components, hooks).
- Edge functions and dependency additions.
