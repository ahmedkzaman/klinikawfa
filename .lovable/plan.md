
# Step 37 — Roles, Registration Numbers & VIP Radar

## Reality-check against the existing codebase

Before approving, please note three deviations from the prompt that this plan resolves explicitly:

1. **There is no `registration_number` column on `patients`.** Today the clinic identifies patients by `national_id` (MyKad). We will **add** a new `reg_no` column and backfill it (Klinik Awfa format `KA-00001`). We will **not** expose `national_id` in the dashboard.
2. **The `app_role` enum currently contains:** `admin`, `staff`, `guest`, `special_admin`, `operations`. The prompt asks for `doctor-admin` and `locum`. Postgres enums accept hyphens but most of the existing codebase uses underscored identifiers, so we will add **`doctor_admin`** and **`locum`** (underscored). All references stay consistent.
3. **There is no `/clinic/patients/:id/history` route.** The existing `PatientProfileSheet` already shows profile + visit history and is the established pattern (used in `PatientsList`). VIP Radar clicks will open this sheet — no new route needed.

---

## A. Database migration — `add_specialized_roles_and_reg_no.sql`

### A1. Extend `app_role` enum
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'doctor_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'locum';
```

### A2. Update role helper functions
Promote `doctor_admin` to admin-equivalent for ops/insight gates; `locum` is treated as **clinical-only** (not ops, not admin).

```sql
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'special_admin')
      OR public.has_role(_user_id, 'doctor_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('operations','admin','special_admin','doctor_admin')
  )
$$;

-- New: insight access (admin + doctor_admin only — pure ops/staff/locum blocked)
CREATE OR REPLACE FUNCTION public.can_view_insights(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin')
  )
$$;
```

### A3. Add `reg_no` to `patients` and backfill
```sql
ALTER TABLE public.patients
  ADD COLUMN reg_no TEXT UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.patient_reg_no_seq START 1;

-- Backfill in registration_date order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY registration_date, created_at) AS rn
  FROM public.patients
)
UPDATE public.patients p
   SET reg_no = 'KA-' || lpad(o.rn::text, 5, '0')
  FROM ordered o
 WHERE p.id = o.id;

-- Auto-assign on insert
CREATE OR REPLACE FUNCTION public.trg_assign_reg_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reg_no IS NULL THEN
    NEW.reg_no := 'KA-' || lpad(nextval('public.patient_reg_no_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER patients_assign_reg_no
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_reg_no();

-- Align sequence past the backfill
SELECT setval('public.patient_reg_no_seq',
  (SELECT COUNT(*) FROM public.patients), true);
```

### A4. Recreate `insight_financials_view` with `reg_no`
Drop and recreate the existing view (created in Step 36) adding `p.reg_no` to the SELECT and a `LEFT JOIN public.patients p ON p.id = c.patient_id`. Keep `WITH (security_invoker = true)` so RLS still applies.

---

## B. Frontend role plumbing

### B1. `src/contexts/AuthContext.tsx`
- Extend `AppRole`: `'special_admin' | 'admin' | 'doctor_admin' | 'operations' | 'staff' | 'locum' | 'guest'`.
- Add derived booleans:
  - `isDoctorAdmin = role === 'doctor_admin'`
  - `isLocum = role === 'locum'`
  - `canViewInsights = role === 'admin' || role === 'special_admin' || role === 'doctor_admin'`
- Update existing flags to include `doctor_admin` where appropriate:
  - `isAdmin`: add `doctor_admin`.
  - `isOpsOrAdmin`: add `doctor_admin`.
  - `isStaffOrAdmin`: add `doctor_admin` and `locum` (locum is clinical staff).
- `isGuest` unchanged (`guest` or `null`).

### B2. Role admin UIs
- `src/pages/staff/admin/Employees.tsx` and `src/pages/clinic/settings/UserManagementSettings.tsx`: add `doctor_admin` and `locum` to the `ROLE_OPTIONS` array and `ROLE_LABEL` map (labels: "Doctor Admin", "Locum Doctor"). No DB change needed beyond the enum — `admin_assign_role` already accepts any `app_role`.

### B3. `ClinicProtectedRoute`
Add a new `requiredRole` value `'insights'` that gates on `canViewInsights`. Apply it to the `/clinic/insight` route in `App.tsx` so locums and pure ops users are bounced to `/staff/dashboard`.

---

## C. `usePatientLTV` hook refactor

`src/hooks/clinic/usePatientLTV.ts` — extend the existing hook:
- Select adds `reg_no` from the view.
- Aggregate as before (3-year recency filter, RM buckets, median).
- **New return field:** `top50: Array<{ patient_id: string; reg_no: string | null; visitCount: number; totalRevenue: number; totalProfit: number }>` — top 50 active patients by `totalRevenue` descending.
- Histogram and median logic unchanged. `top50` is the only new emission; no names or `national_id` ever leave the hook.

---

## D. VIP Radar UI in `LeaderboardsTab.tsx`

Layout (top → bottom):

1. **LTV Histogram + CAC Card** — unchanged from current implementation.
2. **VIP Radar Table (NEW)** — Card titled "VIP Patient Radar" with subtitle "Top 50 active patients by lifetime revenue."
   - Columns: `Rank`, `Reg. No`, `Visits`, `Total LTV (RM)`.
   - **Clickability rule** (uses `useAuth` + `useCurrentDoctor`):
     - If `isDoctorAdmin` **OR** the user has a row in `doctors` (locum case via `useCurrentDoctor().data`), `Reg. No` renders as a button that opens `PatientProfileSheet` for that `patient_id`.
     - Otherwise (pure `admin`, `special_admin` without doctor row), `Reg. No` renders as plain text — they can see the ranking but not the medical record.
   - Empty state: "No active patients to rank."
3. **Doctor Efficiency Leaderboard** — unchanged (already implemented, sorted by gross profit, color-coded margins).

A single `<PatientProfileSheet>` is mounted at the bottom of the tab with state `{ open, patientId }` — the radar rows toggle it.

---

## E. Tab-level access control

In `Insight.tsx`:
- Wrap the entire page in a `canViewInsights` check; if false, render an "Access Restricted" card explaining that only Admins and Doctor-Admins can view financial insights. (Defence in depth — the route guard already redirects, but this protects against direct tab links and ensures consistent UX for anyone who somehow lands here.)

---

## F. Files touched

**Migration (new):**
- `supabase/migrations/<ts>_add_specialized_roles_and_reg_no.sql`
- `supabase/migrations/<ts>_extend_insight_view_with_reg_no.sql` *(separate file for the view recreation, easier to revert)*

**Edited:**
- `src/contexts/AuthContext.tsx` — enum, derived flags, `canViewInsights`.
- `src/components/ClinicProtectedRoute.tsx` — new `'insights'` gate.
- `src/App.tsx` — apply `requiredRole="insights"` to the insight route.
- `src/pages/staff/admin/Employees.tsx` — role options.
- `src/pages/clinic/settings/UserManagementSettings.tsx` — role options + labels.
- `src/hooks/clinic/usePatientLTV.ts` — `top50` emission, `reg_no` column.
- `src/components/clinic/insight/LeaderboardsTab.tsx` — VIP Radar card + sheet.
- `src/pages/clinic/Insight.tsx` — top-level access gate.

**Memory updates:**
- `mem://auth/role-system` — document `doctor_admin` + `locum` and their semantics.
- `mem://index.md` — bump core role-list line.

---

## G. Verification

1. `npx tsc --noEmit` clean.
2. Manual smoke: log in as each role and load `/clinic/insight`:
   - `admin` / `special_admin` → sees Insights, VIP Radar non-clickable.
   - `doctor_admin` → sees Insights, VIP Radar **clickable**.
   - `locum` → redirected from `/clinic/insight`. (Locums consult, they don't audit finance.)
   - `operations` / `staff` → redirected.
   - `guest` → redirected.
3. Patients page should still display correctly with `reg_no` available (no UI change required this step, but the column is now in `types.ts`).

---

## H. Strategic notes (no-glaze)

- **Locum sandbox:** by NOT giving locums insight access, supplier costs and profit margins stay invisible to temporary clinicians — exactly the "in/out clinician" posture the prompt called for.
- **Pure admin can audit but not pry:** non-clinical owners see the rankings (so they can spot a whale patient) but cannot click into a chart, satisfying PDPA's "least privilege" principle.
- **`doctor_admin` is the power role:** the only role that bridges P&L data and clinical context — appropriate for an owner-doctor.
- **Backfill safety:** `reg_no` is `UNIQUE` but nullable initially; the `WITH ordered` CTE assigns deterministic numbers before we add the trigger, so there is no race window.
