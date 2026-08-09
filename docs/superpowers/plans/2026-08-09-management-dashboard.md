# Management Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure monthly command-centre dashboard at `/clinic/dashboard` for every non-locum clinic role, combining trustworthy aggregate operational, financial, stock, marketing and governance metrics.

**Architecture:** A guarded Supabase reporting RPC returns automatic aggregates for one Kuala Lumpur calendar month, while a dedicated RLS-protected table and audited mutation RPC store editable monthly management inputs. React Query loads automatic and manual sections independently so a failed source cannot blank the page; focused presentational components consume a stable TypeScript contract and never query payroll detail rows.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, React 18, TypeScript 5.8, Vite, TanStack Query 5, shadcn/ui, Recharts, Vitest, Testing Library.

## Global Constraints

- Route is exactly `/clinic/dashboard`; sidebar label is exactly `Management Dashboard`.
- View roles are `admin`, `special_admin`, `doctor_admin`, `resident_doctor`, `staff`, `ops_staff`, `operations`, `purchaser`, and `staff_nurse`.
- `locum` and `guest` cannot view; only `admin`, `special_admin`, and `doctor_admin` can create, edit, or delete manual dashboard records.
- Never return or render individual salary, payroll, overtime, or locum detail rows; payroll output is aggregate totals only.
- Use `Asia/Kuala_Lumpur` month/day boundaries.
- Financial totals must reuse `private.financial_control_visit_facts(date,date,date)` so dashboard, Billing, receipts, visit details, and Insight share the same dual-ledger rules.
- Total patients counts queue visits, so repeat visits count separately.
- Waiting time is `queue_entries.created_at` to `called_at`; exclude rows without `called_at` and always show measured-visit count.
- Appointment conversion uses only internal `clinic_appointments`; never mix in public `appointments` booking requests.
- Keep `/clinic/insight`, billing, consultation and existing appointment workflows unchanged except for prospective internal-appointment attendance linkage.
- Manual records are monthly with a unique `(month_start, metric_key)` key and append-only old/new-value audit history.
- Each module must expose its own loading, error and insufficient-data state.
- Do not add a new runtime dependency.

---

## File Map

- `supabase/migrations/<generated>_management_dashboard_foundation.sql` — role helpers, monthly manual records, audit trigger/RPCs, prospective appointment linkage, indexes and RLS.
- `supabase/migrations/<generated>_management_dashboard_reporting.sql` — guarded aggregate reporting RPC and grants.
- `src/test/management-dashboard-migration.test.ts` — static migration security and contract tests.
- `src/test/management-dashboard-reporting-db.test.ts` — disposable-Postgres formula, privacy and role tests.
- `src/lib/clinic/managementDashboard.ts` — dashboard response types, metric catalogue, formatting and derived-state helpers.
- `src/lib/clinic/managementDashboard.test.ts` — pure formula/normalization tests.
- `src/hooks/clinic/useManagementDashboard.ts` — independent automatic/manual queries and audited mutations.
- `src/hooks/clinic/useManagementDashboard.test.tsx` — Supabase contract, query-key and invalidation tests.
- `src/components/clinic/dashboard/DashboardKpiStrip.tsx` — top KPI cards and confidence labels.
- `src/components/clinic/dashboard/FinancialOperationsPanel.tsx` — doctor revenue, trend, payroll aggregates and initiatives.
- `src/components/clinic/dashboard/StockInventoryPanel.tsx` — purchase ratio, expiry, revenue/COGS/margin and feedback.
- `src/components/clinic/dashboard/GrowthMarketingPanel.tsx` — monthly marketing scorecard.
- `src/components/clinic/dashboard/GovernanceCadencePanel.tsx` — recurring meeting/CME checklist.
- `src/components/clinic/dashboard/ManualMetricDialog.tsx` — admin-only typed editor.
- `src/components/clinic/dashboard/ModuleState.tsx` — reusable loading/error/insufficient states.
- `src/pages/clinic/ManagementDashboard.tsx` — month selection, independent module composition and edit orchestration.
- `src/test/management-dashboard-page.test.tsx` — page behavior, access-sensitive editing and month switching.
- `src/components/ClinicProtectedRoute.tsx` — reuse existing `non_locum_staff` gate; no new access tier.
- `src/components/clinic/ClinicLayout.tsx` — non-locum sidebar entry.
- `src/App.tsx` — lazy page import and protected route.
- `src/test/management-dashboard-route-access.test.tsx` — all allowed and denied roles.
- `src/integrations/supabase/types.ts` — regenerated database types after migrations are applied.

---

### Task 1: Manual Metric Storage, Audit and RLS

**Files:**
- Create: `supabase/migrations/<generated>_management_dashboard_foundation.sql`
- Create: `src/test/management-dashboard-migration.test.ts`

**Interfaces:**
- Consumes: `public.has_role(uuid, app_role)` and `auth.uid()`.
- Produces: `public.management_dashboard_monthly_metrics`, `public.management_dashboard_metric_audit`, `public.can_view_management_dashboard(uuid)`, `public.can_edit_management_dashboard(uuid)`, `public.set_management_dashboard_metric(date,text,jsonb)`, and `public.delete_management_dashboard_metric(date,text)`.

- [ ] **Step 1: Generate the migration filename**

Run: `npx supabase migration new management_dashboard_foundation`

Expected: one timestamped migration path; substitute that exact path for `<generated>` below and in later commands.

- [ ] **Step 2: Write the failing migration contract test**

```ts
// src/test/management-dashboard-migration.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.endsWith('_management_dashboard_foundation.sql'))!;
const migrationPath = `supabase/migrations/${migrationName}`;
const sql = readFileSync(migrationPath, 'utf8');

describe('management dashboard foundation migration', () => {
  it('defines month-key uniqueness, RLS and append-only audit', () => {
    expect(sql).toContain('UNIQUE (month_start, metric_key)');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('management_dashboard_metric_audit');
    expect(sql).toMatch(/REVOKE\s+(UPDATE|DELETE|ALL).*management_dashboard_metric_audit/is);
  });

  it('encodes the exact viewer and editor role sets', () => {
    for (const role of ['admin','special_admin','doctor_admin','resident_doctor','staff','ops_staff','operations','purchaser','staff_nurse']) {
      expect(sql).toContain(`'${role}'`);
    }
    expect(sql).toMatch(/can_edit_management_dashboard[\s\S]*'admin'[\s\S]*'special_admin'[\s\S]*'doctor_admin'/);
  });

  it('does not expose mutation RPCs to anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_management_dashboard_metric.*FROM PUBLIC, anon/is);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_management_dashboard_metric.*TO authenticated/is);
  });
});
```

- [ ] **Step 3: Run the test and verify failure**

Run: `npm test -- src/test/management-dashboard-migration.test.ts`

Expected: FAIL because the generated migration does not yet contain the required contracts.

- [ ] **Step 4: Implement the schema and guarded audited mutations**

Use typed columns so numeric, text and status values remain queryable, plus one JSON audit snapshot:

```sql
CREATE TABLE public.management_dashboard_monthly_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL CHECK (month_start = date_trunc('month', month_start)::date),
  metric_key text NOT NULL CHECK (metric_key = ANY (ARRAY[
    'gross_revenue_target','locum_pay','stock_purchase_manual','stock_availability_feedback',
    'initiative_a','initiative_b','initiative_c','google_rating','google_reviews',
    'facebook_followers','instagram_followers','tiktok_followers','facebook_posts',
    'instagram_posts','tiktok_posts','threads_posts','facebook_leads','hq_shooting',
    'outreach_visits','community_health_events','visibility_2','visibility_3','visibility_4',
    'marketing_meeting','staff_meeting_w1','staff_cme_w2','staff_cme_w4','nsep_w3',
    'doctor_alignment','doctor_cme_1','doctor_cme_2','v2v_session','clinic_manager_meeting'
  ])),
  target_numeric numeric,
  actual_numeric numeric,
  status text CHECK (status IS NULL OR status IN ('not_started','in_progress','done','blocked')),
  notes text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month_start, metric_key)
);

CREATE TABLE public.management_dashboard_metric_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_id uuid,
  month_start date NOT NULL,
  metric_key text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_value jsonb,
  new_value jsonb,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);
```

Implement both role helpers as `STABLE SECURITY DEFINER SET search_path = public, pg_temp`, with `can_view` using the exact nine-role list and `can_edit` using the exact three-role list. Enable RLS; SELECT policy calls `can_view_management_dashboard(auth.uid())`; direct INSERT/UPDATE/DELETE policies call `can_edit_management_dashboard(auth.uid())`. The two mutation RPCs must reject unauthorized callers with SQLSTATE `42501`, validate the metric key through the table constraint, upsert/delete, and insert the audit row in the same transaction. Revoke all audit-table writes from `authenticated`; grant only SELECT to authorized users through RLS. Revoke RPC execution from `PUBLIC, anon`, grant to `authenticated`.

- [ ] **Step 5: Run the contract test**

Run: `npm test -- src/test/management-dashboard-migration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_management_dashboard_foundation.sql src/test/management-dashboard-migration.test.ts
git commit -m "feat: add audited management dashboard records"
```

---

### Task 2: Prospective Internal Appointment Attendance Link

**Files:**
- Modify: `supabase/migrations/<generated>_management_dashboard_foundation.sql`
- Modify: `src/test/management-dashboard-migration.test.ts`
- Modify: `src/components/clinic/CheckInAppointmentDialog.tsx`
- Test: `src/test/management-dashboard-appointment-checkin.test.tsx`

**Interfaces:**
- Consumes: `clinic_appointments` statuses `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`; `queue_entries.id`.
- Produces: nullable `clinic_appointments.queue_entry_id uuid`, nullable `checked_in_at timestamptz`, and `public.link_clinic_appointment_checkin(uuid,uuid)`.

- [ ] **Step 1: Extend the failing migration test**

```ts
it('links only internal clinic appointments prospectively', () => {
  expect(sql).toContain('ALTER TABLE public.clinic_appointments');
  expect(sql).toContain('queue_entry_id uuid');
  expect(sql).toContain('checked_in_at timestamptz');
  expect(sql).toContain('link_clinic_appointment_checkin');
  expect(sql).not.toMatch(/ALTER TABLE public\.appointments[\s\S]*queue_entry_id/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/management-dashboard-migration.test.ts`

Expected: FAIL on missing internal appointment linkage.

- [ ] **Step 3: Add the linkage and guarded RPC**

```sql
ALTER TABLE public.clinic_appointments
  ADD COLUMN queue_entry_id uuid REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  ADD COLUMN checked_in_at timestamptz;

CREATE UNIQUE INDEX management_dashboard_clinic_appointment_queue_uidx
  ON public.clinic_appointments(queue_entry_id) WHERE queue_entry_id IS NOT NULL;
CREATE INDEX management_dashboard_clinic_appointment_month_idx
  ON public.clinic_appointments(appointment_date, status);
```

`link_clinic_appointment_checkin(_appointment_id uuid, _queue_entry_id uuid)` must require `public.is_ops_or_admin(auth.uid())`, lock the appointment, verify the queue entry belongs to the same `patient_id`, then set `queue_entry_id`, `checked_in_at = coalesce(checked_in_at, now())`, and `status = 'in_progress'`. Existing imported appointments remain unlinked and therefore yield insufficient coverage rather than invented conversion.

- [ ] **Step 4: Write the failing dialog test**

Mock Supabase and assert that after the existing queue creation succeeds, a selected internal `clinic_appointments.id` invokes:

```ts
expect(rpc).toHaveBeenCalledWith('link_clinic_appointment_checkin', {
  _appointment_id: 'appointment-1',
  _queue_entry_id: 'queue-1',
});
```

Run: `npm test -- src/test/management-dashboard-appointment-checkin.test.tsx`

Expected: FAIL because the check-in flow does not yet call the linkage RPC.

- [ ] **Step 5: Wire internal check-in without altering public booking behavior**

In `CheckInAppointmentDialog.tsx`, carry the selected internal appointment id separately from any public appointment request id. Call `link_clinic_appointment_checkin` only when the checked-in source is a `clinic_appointments` record; keep the existing public `source_appointment_id` behavior unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- src/test/management-dashboard-migration.test.ts src/test/management-dashboard-appointment-checkin.test.tsx`

Expected: PASS.

```bash
git add supabase/migrations/*_management_dashboard_foundation.sql src/components/clinic/CheckInAppointmentDialog.tsx src/test/management-dashboard-*.test.*
git commit -m "feat: track internal appointment attendance"
```

---

### Task 3: Secure Aggregate Reporting RPC

**Files:**
- Create: `supabase/migrations/<generated>_management_dashboard_reporting.sql`
- Create: `src/test/management-dashboard-reporting-db.test.ts`

**Interfaces:**
- Consumes: `private.financial_control_visit_facts(date,date,date)`, queue/consultation/doctor tables, `clinic_appointments`, inventory/batch/procurement tables, attendance/payroll tables, and manual fallback records.
- Produces: `public.get_management_dashboard(_month_start date) RETURNS jsonb` with keys `period`, `operations`, `financial`, `stock`, `appointments`, and `coverage`.

- [ ] **Step 1: Generate the reporting migration**

Run: `npx supabase migration new management_dashboard_reporting`

Expected: one new timestamped reporting migration.

- [ ] **Step 2: Write the disposable-database failing tests**

Create fixtures for two completed visits, one unassigned doctor, one called and one uncalled queue row, patient and panel collection portions, approved OT, one expired inventory row, one internal linked appointment and one cancelled appointment. Assert:

```ts
expect(result.operations.totalPax).toBe(2);
expect(result.operations.averageWaitMinutes).toBe(30);
expect(result.operations.waitMeasuredVisits).toBe(1);
expect(result.financial.grossRevenue).toBe(200);
expect(result.financial.collections).toBe(150);
expect(result.financial.revenueByDoctor).toContainEqual({ doctorId: null, doctorName: 'Unassigned', grossRevenue: 80 });
expect(result.appointments.denominator).toBe(1);
expect(result.appointments.measured).toBe(1);
expect(JSON.stringify(result)).not.toContain('staffId');
```

Also assert locum/guest get SQLSTATE `42501`, all nine view roles succeed, and no result contains employee name, salary, payroll profile id or attendance row id.

- [ ] **Step 3: Run and verify failure**

Run: `npm test -- src/test/management-dashboard-reporting-db.test.ts`

Expected: FAIL because `get_management_dashboard` does not exist.

- [ ] **Step 4: Implement the reporting function**

Implement `SECURITY DEFINER SET search_path = public, private, pg_temp`. First statement:

```sql
IF NOT public.can_view_management_dashboard(auth.uid()) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
END IF;
```

Normalize `_month_start` to its first day; derive `_month_end` as the last day and `_as_of_date = least(_month_end, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)`. Materialize `private.financial_control_visit_facts(_month_start,_as_of_date,_as_of_date)` once inside the function and aggregate gross bill, patient collections, panel receipts, stock revenue/COGS and doctor attribution from it. Calculate queue dates using `(created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date`; waiting only where `called_at IS NOT NULL AND called_at >= created_at`.

Return this stable shape:

```json
{
  "period":{"monthStart":"2026-08-01","asOfDate":"2026-08-09","timezone":"Asia/Kuala_Lumpur"},
  "operations":{"totalPax":0,"averageWaitMinutes":null,"waitMeasuredVisits":0,"daily":[]},
  "financial":{"grossRevenue":0,"patientCollections":0,"panelCollections":0,"collections":0,"revenueByDoctor":[],"approvedOtHours":0,"approvedOtPay":0,"incompleteAttributionCount":0},
  "stock":{"purchaseAmount":null,"purchaseSource":"unavailable","purchasePercent":null,"expiredCount":0,"expirySource":"catalogue","stockRevenue":0,"stockCogs":0,"stockMarginPercent":null},
  "appointments":{"scheduled":0,"attended":0,"denominator":0,"measured":0,"conversionPercent":null,"coverage":"insufficient"},
  "coverage":{"financial":"complete","waiting":"insufficient","inventory":"catalogue","appointments":"insufficient"}
}
```

Procurement purchase source is `received` purchase orders/batches inside the month; if none exist, use `stock_purchase_manual` and label `manual`; otherwise `unavailable`. Expiry source is `batch` when active batch rows exist, otherwise count active `inventory_items` with `current_stock > 0` and expired `coalesce(nearest_expiry_date, latest_expiry_date)`, labelled `catalogue`. Appointment denominator excludes `cancelled` and `no_show`; attended requires `checked_in_at` or linked queue entry. OT aggregates `approved_overtime_hours` and calculated approved pay only; do not select employee identifiers into the returned JSON.

Revoke from `PUBLIC, anon`; grant execute to `authenticated`. Add partial/date indexes needed by `EXPLAIN`: `queue_entries(created_at) WHERE called_at IS NOT NULL`, `clinic_appointments(appointment_date,status)`, `attendance_payroll_records(date)`, and active batch expiry.

- [ ] **Step 5: Run DB and static tests**

Run: `npm test -- src/test/management-dashboard-reporting-db.test.ts src/test/management-dashboard-migration.test.ts`

Expected: PASS, including exact-role and payroll privacy cases.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_management_dashboard_reporting.sql src/test/management-dashboard-reporting-db.test.ts
git commit -m "feat: add aggregate management dashboard reporting"
```

---

### Task 4: Frontend Contract and Query Hooks

**Files:**
- Create: `src/lib/clinic/managementDashboard.ts`
- Create: `src/lib/clinic/managementDashboard.test.ts`
- Create: `src/hooks/clinic/useManagementDashboard.ts`
- Create: `src/hooks/clinic/useManagementDashboard.test.tsx`

**Interfaces:**
- Consumes: `get_management_dashboard`, `management_dashboard_monthly_metrics`, `set_management_dashboard_metric`, `delete_management_dashboard_metric`.
- Produces: `ManagementDashboardReport`, `DashboardManualMetric`, `MANAGEMENT_METRIC_DEFINITIONS`, `useManagementDashboardReport(monthStart)`, `useManagementDashboardManual(monthStart)`, `useSetManagementDashboardMetric()`, `useDeleteManagementDashboardMetric()`.

- [ ] **Step 1: Write failing pure-contract tests**

```ts
expect(normalizeDashboardReport(raw).operations.waitMeasuredVisits).toBe(0);
expect(calculateAchievement(64000, 80000)).toBe(80);
expect(calculateAchievement(64000, 0)).toBeNull();
expect(getCoverageLabel('insufficient', 0)).toBe('Insufficient tracked data');
expect(MANAGEMENT_METRIC_DEFINITIONS.gross_revenue_target.kind).toBe('currency');
expect(MANAGEMENT_METRIC_DEFINITIONS.google_rating.max).toBe(5);
```

Run: `npm test -- src/lib/clinic/managementDashboard.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 2: Implement exact TypeScript contracts and helpers**

Define nullable metrics explicitly; do not coerce unavailable values to zero. Include:

```ts
export type DashboardCoverage = 'complete' | 'partial' | 'insufficient' | 'catalogue';
export type PurchaseSource = 'received' | 'manual' | 'unavailable';
export type ManualMetricStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';
export type DashboardManualMetricInput = {
  monthStart: string; metricKey: ManagementMetricKey;
  targetNumeric: number | null; actualNumeric: number | null;
  status: ManualMetricStatus | null; notes: string;
};
```

The metric catalogue must define all keys from Task 1 with label, group, kind (`currency`, `number`, `rating`, `status`, `text`, `checkbox`) and numeric constraints. `calculateAchievement` returns `null` when target is null/non-positive.

- [ ] **Step 3: Run pure tests**

Run: `npm test -- src/lib/clinic/managementDashboard.test.ts`

Expected: PASS.

- [ ] **Step 4: Write failing hook tests**

Assert automatic query key `['clinic','management-dashboard','report','2026-08-01']`, manual key `['clinic','management-dashboard','manual','2026-08-01']`, exact RPC argument `{ _month_start: '2026-08-01' }`, and successful mutation invalidates only the selected month's manual and report keys.

Run: `npm test -- src/hooks/clinic/useManagementDashboard.test.tsx`

Expected: FAIL because hooks are missing.

- [ ] **Step 5: Implement independent hooks**

Set report `staleTime` to 60 seconds and manual records to 15 seconds. Keep automatic and manual queries separate; return Supabase errors without replacing them with empty arrays. Mutation calls must send snake_case RPC payload fields and expose authorization failures unchanged for the page to display.

- [ ] **Step 6: Run and commit**

Run: `npm test -- src/lib/clinic/managementDashboard.test.ts src/hooks/clinic/useManagementDashboard.test.tsx`

Expected: PASS.

```bash
git add src/lib/clinic/managementDashboard* src/hooks/clinic/useManagementDashboard*
git commit -m "feat: add management dashboard data client"
```

---

### Task 5: Command Centre Grid Components

**Files:**
- Create: `src/components/clinic/dashboard/ModuleState.tsx`
- Create: `src/components/clinic/dashboard/DashboardKpiStrip.tsx`
- Create: `src/components/clinic/dashboard/FinancialOperationsPanel.tsx`
- Create: `src/components/clinic/dashboard/StockInventoryPanel.tsx`
- Create: `src/components/clinic/dashboard/GrowthMarketingPanel.tsx`
- Create: `src/components/clinic/dashboard/GovernanceCadencePanel.tsx`
- Create: `src/components/clinic/dashboard/ManualMetricDialog.tsx`
- Create: `src/test/management-dashboard-components.test.tsx`

**Interfaces:**
- Consumes: contracts and metric definitions from `src/lib/clinic/managementDashboard.ts`.
- Produces: accessible presentational components with `canEdit: boolean` and `onEdit(metricKey)` callbacks; no component performs its own data fetch.

- [ ] **Step 1: Write failing component tests**

Render fixtures and assert:

```ts
expect(screen.getByText('Measured from 1 called visit')).toBeInTheDocument();
expect(screen.getByText('Insufficient tracked data')).toBeInTheDocument();
expect(screen.getByText('Unassigned')).toBeInTheDocument();
expect(screen.getByText('Manual')).toBeInTheDocument();
expect(screen.queryByText('Employee A')).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument(); // canEdit=false
```

Also verify >45-minute wait and >25% stock purchase use warning styling, stock margin handles zero revenue as unavailable, and keyboard focus reaches every edit action when `canEdit=true`.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/management-dashboard-components.test.tsx`

Expected: FAIL because components are missing.

- [ ] **Step 3: Implement the shared state and top KPI strip**

`ModuleState` accepts `status: 'loading'|'error'|'insufficient'`, a concise message and retry callback. `DashboardKpiStrip` renders Total patients, Average waiting, MTD gross revenue, MTD collections, MTD achievement and Appointment conversion. Gross revenue and collections must be separate cards. Waiting always includes measured count; conversion renders its denominator and never formats null as `0%`.

- [ ] **Step 4: Implement Financial and Stock panels**

Use Recharts only for doctor revenue and the daily patient/wait trend. Retain `Unassigned`, show incomplete-attribution badge/explanation, aggregate locum pay and OT only, and never accept staff-detail props. Stock shows source labels (`Received`, `Manual`, `Unavailable`, `Batch-level`, `Catalogue-level`) next to each value.

- [ ] **Step 5: Implement Growth, Governance and editor components**

Group growth metrics into reputation, audience, publishing and outreach. Governance shows the exact monthly cadence checklist. `ManualMetricDialog` derives input controls from the metric catalogue, validates rating 0–5 and non-negative numeric values, requires month/key from props, and exposes Save/Delete only when `canEdit`.

- [ ] **Step 6: Run and commit**

Run: `npm test -- src/test/management-dashboard-components.test.tsx`

Expected: PASS.

```bash
git add src/components/clinic/dashboard src/test/management-dashboard-components.test.tsx
git commit -m "feat: build management command centre panels"
```

---

### Task 6: Page Composition and Independent Failure Handling

**Files:**
- Create: `src/pages/clinic/ManagementDashboard.tsx`
- Create: `src/test/management-dashboard-page.test.tsx`
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: hooks from Task 4 and components from Task 5.
- Produces: `ManagementDashboard` page; `canEditManagementDashboard` auth-derived boolean.

- [ ] **Step 1: Write failing page tests**

Test August month selection, default current month in Kuala Lumpur, month switch query inputs, automatic report failure while manual panels remain visible, manual failure while automatic KPIs remain visible, edit buttons for the three editor roles, and read-only rendering for every other allowed role including `staff`.

```ts
expect(screen.getByRole('heading', { name: 'Management Dashboard' })).toBeInTheDocument();
expect(screen.getByText('Financial & Operations')).toBeInTheDocument();
expect(screen.getByText('Stock & Inventory')).toBeInTheDocument();
expect(screen.getByText('Growth & Marketing')).toBeInTheDocument();
expect(screen.getByText('Governance & Operational Cadence')).toBeInTheDocument();
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/management-dashboard-page.test.tsx`

Expected: FAIL because the page and edit capability are missing.

- [ ] **Step 3: Add the auth capability**

In `AuthContext.tsx`, derive exactly:

```ts
const canEditManagementDashboard =
  role === 'admin' || role === 'special_admin' || role === 'doctor_admin';
```

Expose it in the context interface/value; do not broaden `canViewInsights` or `isAdmin`.

- [ ] **Step 4: Compose the page**

Use an `<input type="month">` or existing month picker whose value is `YYYY-MM`; convert to `YYYY-MM-01`. Render the KPI/Financial/Stock modules from report query and Growth/Governance/manual operation entries from the manual query. A report error must occupy only automatic modules; a manual-query error must occupy only manual modules. Use the selected month in dialog mutations and display automatic/manual badges.

- [ ] **Step 5: Run and commit**

Run: `npm test -- src/test/management-dashboard-page.test.tsx src/test/management-dashboard-components.test.tsx`

Expected: PASS.

```bash
git add src/pages/clinic/ManagementDashboard.tsx src/contexts/AuthContext.tsx src/test/management-dashboard-page.test.tsx
git commit -m "feat: compose management dashboard page"
```

---

### Task 7: Route, Sidebar and Role Matrix

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/clinic/ClinicLayout.tsx`
- Create: `src/test/management-dashboard-route-access.test.tsx`

**Interfaces:**
- Consumes: existing `ClinicProtectedRoute requiredRole="non_locum_staff"`.
- Produces: lazy-loaded `/clinic/dashboard` route and non-locum sidebar item.

- [ ] **Step 1: Write the failing role-matrix test**

Parameterize all roles:

```ts
const allowed = ['admin','special_admin','doctor_admin','resident_doctor','staff','ops_staff','operations','purchaser','staff_nurse'];
const denied = ['locum','guest'];
```

For allowed roles, `/clinic/dashboard` renders page content. `locum` redirects to `/clinic/queue`; `guest` redirects to `/`. Assert sidebar item exists for every allowed role and is absent for locum.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/management-dashboard-route-access.test.tsx`

Expected: FAIL because route/nav item do not exist.

- [ ] **Step 3: Add lazy route and navigation**

In `App.tsx` add a lazy import consistent with other clinic pages and:

```tsx
<Route
  path="dashboard"
  element={
    <ClinicProtectedRoute requiredRole="non_locum_staff">
      <ManagementDashboard />
    </ClinicProtectedRoute>
  }
/>
```

In `ClinicLayout.tsx`, add `{ href: '/clinic/dashboard', label: 'Management Dashboard', icon: Gauge }` without `locumAllowed`, `adminOnly`, or `specialAdminOnly`. Do not change the existing Insight item.

- [ ] **Step 4: Run and commit**

Run: `npm test -- src/test/management-dashboard-route-access.test.tsx src/test/offline-consultation-route-access.test.tsx`

Expected: PASS and no regression to existing route gates.

```bash
git add src/App.tsx src/components/clinic/ClinicLayout.tsx src/test/management-dashboard-route-access.test.tsx
git commit -m "feat: expose management dashboard to non-locum staff"
```

---

### Task 8: Supabase Types, Performance and Deployment Verification

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Modify if required by generated migration names only: `src/test/management-dashboard-*.test.*`

**Interfaces:**
- Consumes: completed database schema and frontend implementation.
- Produces: deployed migrations, generated TypeScript bindings, verified production bundle and GitHub `main` deployment.

- [ ] **Step 1: Link and apply migrations to the production project**

Run:

```powershell
npx supabase link --project-ref nhjbqdiyptjqherdfbqk
npx supabase migration list
npx supabase db push
```

Expected: both management-dashboard migrations are applied once; no unrelated pending migration is silently skipped or repaired.

- [ ] **Step 2: Regenerate types**

Run:

```powershell
npx supabase gen types typescript --linked | Set-Content -Encoding utf8 src/integrations/supabase/types.ts
```

Expected: generated types include both dashboard tables, both mutation RPCs, `get_management_dashboard`, `clinic_appointments.queue_entry_id`, and `checked_in_at`.

- [ ] **Step 3: Run focused and regression tests**

Run:

```powershell
npm test -- src/test/management-dashboard-migration.test.ts src/test/management-dashboard-reporting-db.test.ts src/lib/clinic/managementDashboard.test.ts src/hooks/clinic/useManagementDashboard.test.tsx src/test/management-dashboard-components.test.tsx src/test/management-dashboard-page.test.tsx src/test/management-dashboard-route-access.test.tsx src/test/offline-consultation-route-access.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Run build and repository checks**

Run:

```powershell
npm run build
git diff --check
npx supabase db lint --linked --level warning
```

Expected: production build succeeds, diff check is clean, and database lint has no new dashboard security/performance warnings. Inspect `EXPLAIN (ANALYZE, BUFFERS)` for `get_management_dashboard('2026-08-01')`; target under 2 seconds on current production volume and no repeated full scan of financial facts.

- [ ] **Step 5: Verify production role and data behavior**

Check with authenticated test users or SQL role fixtures:

- all nine view roles receive one aggregate JSON report;
- locum and guest receive `NOT_AUTHORIZED`/route redirect;
- only the three editor roles can mutate;
- waiting sample count matches rows with valid `called_at` rather than imported completed rows;
- August gross revenue agrees with the existing dual-ledger report for the same date range;
- returned JSON contains no staff identity or payroll-detail key;
- appointment conversion reads `clinic_appointments` only and shows insufficient coverage for unlinked history;
- manual stock fallback is visibly labelled `Manual` while procurement history is empty.

- [ ] **Step 6: Commit generated types and push**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: refresh management dashboard database types"
git push origin HEAD:main
```

Expected: push succeeds and GitHub Pages workflow starts for the new main commit.

- [ ] **Step 7: Verify deployment**

Run:

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' run list --repo ahmedkzaman/klinikawfa --limit 5
curl.exe -I https://klinikawfa.com/clinic/dashboard
```

Expected: latest deployment workflow succeeds and the route returns the SPA successfully. Sign in on production and repeat the view/edit/locum smoke tests before declaring completion.

---

## Final Self-Review Checklist

- [ ] Every approved automatic KPI maps to Task 3 and a rendered component in Task 5.
- [ ] Every approved manual metric key appears in Task 1 and `MANAGEMENT_METRIC_DEFINITIONS` in Task 4.
- [ ] `staff` is included in view access; `locum` and `guest` are denied at route and database layers.
- [ ] Payroll remains aggregate-only from SQL return contract through component props.
- [ ] Gross revenue and collections are visibly separate and use shared dual-ledger facts.
- [ ] Waiting and appointment metrics expose sample/coverage instead of misleading zeroes.
- [ ] Internal and public appointment systems are not mixed.
- [ ] Manual changes are auditable and audit rows cannot be edited or deleted by authenticated clients.
- [ ] Placeholder scan is clean and every implementation step contains exact behavior and verification.
- [ ] Type names, RPC arguments, JSON keys and React prop names are identical across tasks.
