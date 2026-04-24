
## Step 10 — Production Hardening: COGS Snapshotting & Clinical Grouping (Refined)

Adds UUID relations + automated `unit_cost` snapshotting on `consultation_items`, a `cost` column on `packages`, a `group_category` on `diagnoses`, and backfills historical rows from current master prices including packages. The trigger fires on both INSERT and UPDATE so cost is re-snapshotted whenever the linked source changes. Hooks updated to read the new columns and accept optional FK ids on insert; the client never sends `unit_cost`.

---

### 1. Migration — `<ts>_production_hardening_step10.sql`

```sql
-- A. UUID relations + unit_cost on consultation_items
ALTER TABLE public.consultation_items
  ADD COLUMN IF NOT EXISTS item_id    uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost  numeric(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_consultation_items_ids
  ON public.consultation_items(item_id, service_id, package_id);

-- B. Add cost to packages (services.cost already exists)
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS cost numeric(10,2) NOT NULL DEFAULT 0;

-- C. Refined COGS snapshot trigger — INSERT + UPDATE, recalc only when source changes
CREATE OR REPLACE FUNCTION public.trg_lock_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (NEW.item_id    IS DISTINCT FROM OLD.item_id)
     OR (NEW.service_id IS DISTINCT FROM OLD.service_id)
     OR (NEW.package_id IS DISTINCT FROM OLD.package_id)
     OR (NEW.item_name  IS DISTINCT FROM OLD.item_name) THEN

    IF NEW.item_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost_price FROM public.inventory_items WHERE id = NEW.item_id), 0);
    ELSIF NEW.service_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost FROM public.services WHERE id = NEW.service_id), 0);
    ELSIF NEW.package_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost FROM public.packages WHERE id = NEW.package_id), 0);
    ELSE
      NEW.unit_cost := COALESCE(
        (SELECT cost_price FROM public.inventory_items WHERE name = NEW.item_name AND status = 'active' LIMIT 1),
        (SELECT cost FROM public.services             WHERE name = NEW.item_name LIMIT 1),
        (SELECT cost FROM public.packages             WHERE name = NEW.item_name LIMIT 1),
        0
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_insert_lock_cogs ON public.consultation_items;
DROP TRIGGER IF EXISTS lock_cogs_on_change     ON public.consultation_items;
CREATE TRIGGER lock_cogs_on_change
  BEFORE INSERT OR UPDATE ON public.consultation_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_lock_cogs();

-- D. Diagnosis grouping
ALTER TABLE public.diagnoses
  ADD COLUMN IF NOT EXISTS group_category text NOT NULL DEFAULT 'Uncategorized';
CREATE INDEX IF NOT EXISTS idx_diagnoses_group_category ON public.diagnoses(group_category);

-- E. Historical backfill — inventory, services, AND packages
UPDATE public.consultation_items ci
   SET unit_cost = ii.cost_price
  FROM public.inventory_items ii
 WHERE ci.unit_cost = 0 AND ci.item_name = ii.name AND ii.status = 'active';

UPDATE public.consultation_items ci
   SET unit_cost = s.cost
  FROM public.services s
 WHERE ci.unit_cost = 0 AND ci.item_name = s.name;

UPDATE public.consultation_items ci
   SET unit_cost = p.cost
  FROM public.packages p
 WHERE ci.unit_cost = 0 AND ci.item_name = p.name;
```

Refinements vs prior draft:
- Trigger now fires `BEFORE INSERT OR UPDATE` and only recalculates when the source link (`item_id` / `service_id` / `package_id` / `item_name`) actually changes — no wasted work on quantity/price/dosage edits.
- Packages added to both the legacy fallback in the trigger and the historical backfill so package-based historical rows also get a non-zero `unit_cost`.
- Trigger renamed to `lock_cogs_on_change` to reflect new scope; both old and new trigger names are dropped first for idempotent re-runs.

### 2. Hook updates

**`src/hooks/clinic/useDiagnoses.ts`** (edit)
- `select` → `'id, name, status, group_category, created_at, updated_at'`, ordered by `group_category` then `name`.
- `addDiagnosis.mutationFn` → `(payload: { name: string; group_category?: string })`; insert defaults to `'Uncategorized'`.
- `updateDiagnosis.mutationFn` → also accepts `group_category?: string`.
- `deleteDiagnosis` untouched.

**`src/hooks/clinic/useConsultationItems.ts`** (edit)
- Query keeps `select('*')` (new columns appear once `types.ts` regenerates).
- `useAddConsultationItem` input extended with optional `item_id?`, `service_id?`, `package_id?` (string | null). Payload forwarded as-is. Existing `isInsufficientStock` toast logic preserved. **No `unit_cost` field** on insert.
- `useUpdateConsultationItem` and `useRemoveConsultationItem` untouched.

---

### Out of scope
- Any UI for `unit_cost`, margin, COGS, or `group_category` editor — `unit_cost` stays invisible to clinical staff this step.
- Backfilling FK ids (`item_id`/`service_id`/`package_id`) on legacy rows — future inserts will carry FKs once catalog pickers are wired.
- Touching `_resolve_inventory_item_id`, inventory reservation triggers, or any consultation/dispense/billing flow.

### Files touched

| File | Action |
|---|---|
| `supabase/migrations/<ts>_production_hardening_step10.sql` | New |
| `src/hooks/clinic/useDiagnoses.ts` | Edit — read + write `group_category` |
| `src/hooks/clinic/useConsultationItems.ts` | Edit — accept optional FK ids on insert; never send `unit_cost` |

### Verification
1. `pg_constraint` shows three new FKs on `consultation_items`; `idx_consultation_items_ids` and `idx_diagnoses_group_category` present; `lock_cogs_on_change` trigger listed (INSERT + UPDATE).
2. Backfill: `SELECT count(*) FROM consultation_items WHERE unit_cost > 0` non-zero across inventory, service, and package historical rows.
3. Insert sanity: with `item_id` → cost = inventory `cost_price`; with `service_id` → services `cost`; with `package_id` → packages `cost`; only `item_name` matching → fallback resolves; no match → `0`.
4. Update sanity: changing `item_id` re-snapshots; changing only `quantity`/`price` does NOT re-snapshot.
5. `tsc --noEmit` passes; `useDiagnoses` rows expose `group_category`; `useConsultationItems` rows expose `unit_cost` + new FK ids.
6. Network panel during a prescription shows no `unit_cost` field in any POST/PATCH body.
7. Existing pages (Queue, Consultation, Dispense, Billings, Panel Claims, Voided, Settings) render unchanged.
