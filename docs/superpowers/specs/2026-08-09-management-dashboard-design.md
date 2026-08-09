# Management Dashboard Design

## Goal

Create a monthly clinic management dashboard at `/clinic/dashboard` that gives all non-locum clinic staff a single daily/monthly command centre for operations, finances, stock, growth activities and governance cadence.

## Audience and access

- `admin`, `special_admin`, `doctor_admin`, `resident_doctor`, `staff`, `ops_staff`, `operations`, `purchaser` and `staff_nurse` can view the dashboard.
- `locum` and `guest` cannot view the dashboard.
- `admin`, `special_admin` and `doctor_admin` can create, edit and delete dashboard targets and manual records.
- Database RLS enforces the same read/write rules as the UI.
- Payroll is aggregate-only: viewers never see individual salary or staff payroll rows.

## Page and layout

- Route: `/clinic/dashboard`.
- Sidebar label: `Management Dashboard`.
- Layout: Command Centre Grid (selected mockup A).
- A month selector controls monthly metrics and manual records.
- Daily patient counts and waiting-time trends are shown within the selected month.
- The four main modules remain visible without requiring tabs:
  1. Financial & Operations
  2. Stock & Inventory
  3. Growth & Marketing
  4. Governance & Operational Cadence

## Automatic metrics

### Top KPI row

- Total patients (pax): queue visits in the selected period. Repeat visits count as separate pax.
- Average waiting time: `queue_entries.created_at` to `queue_entries.called_at`; alert when the average exceeds 45 minutes. Rows without `called_at`, including imported legacy visits, are excluded and the measured-visit count is shown beside the average.
- MTD gross revenue: completed-visit bill totals, including patient and panel portions, using the shared dual-ledger visit facts.
- MTD collections: patient payments plus panel receipts, shown separately from gross revenue so receivables are not mistaken for cash collected.
- MTD achievement: MTD gross revenue divided by the editable monthly gross-revenue target.
- Appointment conversion: attended/check-in appointments divided by non-cancelled scheduled appointments. This is a prospective metric and shows `Insufficient tracked data` until appointment attendance linkage is present.

### Financial and operations

- Revenue by doctor: completed-visit gross billed revenue grouped by treating doctor, with `Unassigned` retained as a visible group.
- Locum pay: manual aggregate monthly amount until locum payroll records are captured by the system; no individual locum details are stored in the dashboard.
- Approved OT: aggregate approved overtime hours and calculated overtime pay from attendance/payroll records, without exposing individual staff rows.
- Daily patient and waiting-time trend.
- Initiatives A, B and C as manual status/action records.

### Stock and inventory

- Stock purchase percentage: selected-month stock purchases divided by previous-month gross revenue, with a warning above 25%. Use received purchase orders/batches when present; otherwise use the admin-entered aggregate purchase amount and label it `Manual`.
- Expired stock count: active stock batches at or past expiry; while batch history is unavailable, fall back to active `inventory_items` with stock above zero and an expired nearest/latest expiry date, visibly labelled as catalogue-level data.
- Stock revenue versus current COGS.
- Stock margin percentage: `(stock revenue - stock COGS) / stock revenue * 100`.
- Manual stock availability feedback.

## Manual monthly metrics

Operational manual records include monthly gross-revenue target, aggregate locum pay, fallback stock purchase amount, stock availability feedback and initiatives A/B/C.

Growth and marketing records include Google rating, Google review count, Facebook/Instagram/TikTok follower growth, weekly post counts for Facebook/Instagram/TikTok/Threads, Facebook lead count, HQ shooting session status, outreach visits, community health events, and visibility initiatives 2/3/4.

Governance records include monthly marketing meeting, monthly staff meeting W1, weekly staff CME W2/W4, NSEP W3, doctor alignment meeting, doctor CME, V2V session and Clinic Manager Meeting.

Each manual record stores month, metric key, target, actual value, status, notes, editor identity and timestamps. The current system is single-clinic, so no unsupported `clinic_id` is introduced.

## Data architecture

- Automatic metrics read existing queue, consultation, internal appointment, billing, payment, panel claim, inventory, COGS and payroll data.
- Financial values use the same dual-ledger calculation already used by billing, visit detail, receipts and Insight.
- Appointment conversion uses `clinic_appointments` and a minimal attendance/check-in link added prospectively; public website booking requests are not mixed with internal scheduled appointments.
- Waiting-time metrics include a sample count and never substitute imported completion timestamps for missing `called_at` values.
- The dashboard reporting RPC returns only aggregate locum/OT figures and never exposes individual payroll rows to dashboard viewers.
- A staff-authorized reporting RPC or equivalent query returns a stable dashboard contract for a selected month.
- Missing doctor attribution is represented as `Unassigned`; incomplete financial attribution is represented as `Incomplete` with an explanation.
- Manual records use a dedicated month-scoped table with a unique `(month, metric_key)` key.
- An append-only audit table records the old value, new value, editor and timestamp for every manual change.
- RLS policies permit non-locum reads and restrict writes to `admin`, `special_admin` and `doctor_admin`.

## Failure handling

- Each module loads independently; one failed metric does not blank the entire dashboard.
- Loading, unavailable-data and permission states explain the affected metric.
- Metrics with inadequate source coverage show `Insufficient tracked data` and the measured row count instead of a misleading zero.
- Date boundaries use the clinic's Asia/Kuala_Lumpur local-day convention.
- Automatic and manual values are visually distinguished.

## Validation and rollout

- Add unit and component tests for formulas, role access (including `staff`), month switching, manual edit permissions, waiting-time coverage, prospective appointment conversion, aggregate payroll privacy and incomplete attribution.
- Add migration contract tests for tables, RPCs, indexes and RLS.
- Run the focused tests, full production build, `git diff --check`, Security Gate and GitHub Pages deployment.
- Do not change the existing `/clinic/insight` access rules or current billing/consultation workflows. Appointment work is limited to correcting the existing schema drift and recording check-in/attendance linkage required by the conversion metric.

## Verified current-data constraints

- Production contains substantial imported visit history but only a small set of queue rows with `called_at`; waiting-time reporting therefore excludes legacy rows and reports its sample size.
- Internal clinic appointments currently use `clinic_appointments`; public booking requests use a separate `appointments` table. They must not be combined into one denominator.
- Existing internal appointments do not yet carry reliable attended/completed linkage, so appointment conversion begins prospectively after instrumentation is deployed.
- Locum users currently have no payroll profiles, so locum pay cannot be calculated automatically from existing payroll data.
- Purchase orders, vendor invoices and inventory batches currently have no recorded purchase history, so stock purchase value requires a manual aggregate fallback until procurement receiving is used consistently.
