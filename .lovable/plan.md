
## Step 6 (Option A) — Create `payment_methods` Table

Scope: One migration. Create the missing `payment_methods` table with a column shape that matches what the Clinic Flow frontend expects (verified against the reference project), apply 4 RLS policies, and stop. No frontend code. No changes to the six existing tables.

---

### Verification of expected schema (from Clinic Flow reference project `248fba2c-eed8-4623-a193-dd2f8b9226b4`)

I inspected the reference project's `usePaymentMethods` hook, `RecordPaymentDialog`, `DispenseCheckout`, and the `payment_methods` table type in `src/integrations/supabase/types.ts`. The columns the frontend reads/writes are:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | standard |
| `name` | text NOT NULL | e.g. "Cash", "Visa", "TouchNGo" |
| `type` | text NOT NULL | enum-like string: `'cash' \| 'card' \| 'ewallet' \| 'bank_transfer' \| 'panel' \| 'insurance' \| 'other'` |
| `provider_id` | uuid NULL | FK → `insurance_providers(id)` (only set when `type = 'panel'` or `'insurance'`) |
| `account_details` | text NULL | Free-text (last-4, terminal ID, etc.) — used by RecordPaymentDialog |
| `surcharge_percentage` | numeric(5,2) NULL DEFAULT 0 | Card processor fee passed to patient |
| `display_order` | integer NOT NULL DEFAULT 0 | Sort order on checkout panel |
| `status` | text NOT NULL DEFAULT 'active' | `'active' \| 'inactive'` — matches the pattern used by other clinic tables (`services`, `packages`, etc.) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | standard |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | for `updated_at` trigger consistency |

The richer shape (vs. the spec's `is_active` boolean) keeps the table consistent with sibling tables already in the database (`services.status`, `packages.status`, `insurance_providers.status`) and matches the frontend's filter `.eq('status', 'active')` instead of `.eq('is_active', true)`.

---

### Migration SQL

```sql
-- 1. Table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash','card','ewallet','bank_transfer','panel','insurance','other')),
  provider_id uuid NULL REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  account_details text NULL,
  surcharge_percentage numeric(5,2) NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for common lookup
CREATE INDEX IF NOT EXISTS payment_methods_status_order_idx
  ON public.payment_methods (status, display_order);

-- 3. updated_at trigger (reuses existing helper)
DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_authenticated_select"
  ON public.payment_methods FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_methods_ops_insert"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "payment_methods_ops_update"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "payment_methods_special_admin_delete"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));
```

---

### Notes on deviations from the original spec

1. **`status` instead of `is_active`** — matches sibling tables (`services`, `packages`, `insurance_providers`) and the reference frontend's query pattern. Avoids two competing "is this row live?" conventions in one schema.
2. **Added `account_details`, `surcharge_percentage`, `display_order`, `updated_at`** — required by `DispenseCheckout` and `RecordPaymentDialog` in the reference project. Adding them now avoids a follow-up `ALTER TABLE` in Step 7.
3. **CHECK constraints on `type` and `status`** — string enums (immutable, safe under restore).
4. **`updated_at` trigger** — uses the existing `public.update_updated_at_column()` function already in the database.
5. **Policy names prefixed with `payment_methods_`** — matches the naming convention used on every other clinic table in the schema.

---

### Out of scope

- The six existing tables (`insurance_providers`, `services`, `packages`, `vital_signs`, `stock_takes`, `stock_take_counts`) — untouched.
- Seed data for default payment methods (Cash / Visa / TouchNGo) — Step 7 settings UI will let ops add these.
- Any frontend code (`usePaymentMethods` hook, `RecordPaymentDialog`, settings panel) — Step 7+.

### Verification after migration

1. `payment_methods` table exists with all 10 columns.
2. RLS is enabled; 4 policies present (one per command).
3. `updated_at` trigger fires on UPDATE.
4. `provider_id` FK to `insurance_providers` works (insert with NULL succeeds; insert with valid uuid succeeds; insert with random uuid fails).
5. `supabase--linter` returns no new criticals.
6. Existing six tables are byte-identical (no policies, columns, or constraints touched).

**Stop after the migration applies cleanly. No frontend code in this step.**
