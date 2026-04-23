
## Step 2 — Database Hardening (B.3 + B.4 + B.5)

Three sequential migrations. SQL only. No frontend changes. Stop and confirm after all three apply cleanly.

---

### Migration 4 — `<ts>_inventory_allocation.sql` (B.3)

**Schema:**
```sql
ALTER TABLE public.inventory_items
  ADD COLUMN allocated_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (allocated_quantity >= 0);
```

**Helper** — `available_quantity(_item_id uuid) → integer`, `STABLE`, `SECURITY DEFINER`, `search_path=public`:
```sql
SELECT GREATEST(stock - allocated_quantity, 0)
FROM public.inventory_items WHERE id = _item_id;
```

**Three SECURITY DEFINER mutators** — `OWNER TO postgres`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`. Each uses `SELECT ... FOR UPDATE` to serialize concurrent allocations:

- `reserve_inventory(_item_id uuid, _qty integer)` → locks row, raises `insufficient_stock` (`P0001`) if `stock - allocated_quantity < _qty`, otherwise increments `allocated_quantity`.
- `commit_inventory(_item_id uuid, _qty integer)` → locks row, decrements both `stock` and `allocated_quantity` by `_qty`. Used when consultation finalized + dispensed.
- `release_inventory(_item_id uuid, _qty integer)` → locks row, decrements `allocated_quantity` by `_qty` (no stock change). Used on void / soft-delete.

**Triggers on `consultation_items`:**
- `AFTER INSERT` (active row, item resolves to inventory): call `reserve_inventory`.
- `AFTER UPDATE` of `quantity` (active → active): diff and `reserve_inventory(diff)` or `release_inventory(-diff)`.
- `AFTER UPDATE` where `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL` (soft-delete transition): `release_inventory(quantity)`.

**Trigger on `consultations`** for status transitions:
- `AFTER UPDATE` where `NEW.status = 'completed' AND OLD.status <> 'completed'`: for each active `consultation_items` row, `commit_inventory(quantity)`.
- `AFTER UPDATE` where `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL`: for each still-active `consultation_items` row, `release_inventory(quantity)`.

**Item resolution**: triggers must resolve `item_name` → `inventory_items.id`. Skip non-inventory items (free-text services) silently. Use a join `inventory_items WHERE name = item_name AND status = 'active' LIMIT 1`.

---

### Migration 5 — `<ts>_midnight_queue.sql` (B.4)

**Replace** any existing `reset_queue_number_seq()` (drop if present) with:

```sql
CREATE OR REPLACE FUNCTION public.safe_reset_queue_number_seq()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_active integer;
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) INTO v_max_active
  FROM public.queue_entries
  WHERE deleted_at IS NULL
    AND clinic_status IN (
      'registered','ready_for_doctor','with_doctor',
      'sent_to_dispensary','dispensing_payment','on_hold'
    );

  IF v_max_active = 0 THEN
    v_next := 1001;  -- queue fully drained: hard reset to anchor
  ELSE
    v_next := v_max_active + 1;  -- preserve continuity
  END IF;

  PERFORM setval('public.queue_number_seq', v_next, false);
END;
$$;

REVOKE ALL ON FUNCTION public.safe_reset_queue_number_seq() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_reset_queue_number_seq() TO authenticated;
ALTER FUNCTION public.safe_reset_queue_number_seq() OWNER TO postgres;
```

If `queue_number_seq` doesn't exist yet, `CREATE SEQUENCE IF NOT EXISTS public.queue_number_seq START 1001;` first.

---

### Migration 6 — `<ts>_intake_rpc.sql` (B.5)

Single-transaction atomic intake — replaces two-call frontend pattern:

```sql
CREATE OR REPLACE FUNCTION public.intake_appointment_to_queue(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_visit_purpose text DEFAULT 'consultation',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
  v_appt_status text;
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_appt_status
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt_status = 'checked_in' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.queue_entries (
    patient_id, visit_purpose, visit_notes,
    source_appointment_id, created_by, clinic_status
  )
  VALUES (
    p_patient_id, p_visit_purpose, p_notes,
    p_appointment_id, auth.uid(), 'registered'
  )
  RETURNING id INTO v_queue_id;

  UPDATE public.appointments
     SET status = 'checked_in'
   WHERE id = p_appointment_id;

  RETURN v_queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) TO authenticated;
ALTER FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) OWNER TO postgres;
```

`SELECT ... FOR UPDATE` on the appointment row guarantees no two clerks can intake the same appointment concurrently. Whole operation is one transaction — if either insert or update fails, both roll back.

---

### Execution order

```text
4. <ts>_inventory_allocation.sql  -- column + helper + 3 mutators + triggers
5. <ts>_midnight_queue.sql        -- safe_reset_queue_number_seq
6. <ts>_intake_rpc.sql            -- intake_appointment_to_queue
```

After all three apply: run the Supabase linter, confirm no new criticals, report success. **Stop. Do not begin Step 3 (frontend foundation work).**

### Out of scope for Step 2

- Any frontend file (`App.tsx`, `AuthContext.tsx`, components, hooks).
- Inventory UI (Stock/Allocated/Available columns).
- Soft-delete helper wiring.
- Edge functions and dependency additions.
