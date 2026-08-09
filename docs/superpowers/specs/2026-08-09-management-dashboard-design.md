# Management Dashboard Design

## Goal

Create a monthly clinic management dashboard at `/clinic/dashboard` that gives all non-locum clinic staff a single daily/monthly command centre for operations, finances, stock, growth activities and governance cadence.

## Audience and access

- `admin`, `special_admin`, `doctor_admin`, `resident_doctor`, `ops_staff`, `operations`, `purchaser` and `staff_nurse` can view the dashboard.
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

- Total patients: patient visits in the selected period.
- Average waiting time: arrival-to-consultation-start duration; alert when the average exceeds 45 minutes.
- MTD revenue: collected cash/QR/card/transfer plus panel received, using the shared dual-ledger calculation.
- MTD achievement: actual MTD revenue divided by the editable monthly revenue target.
- Appointment conversion: completed appointments divided by scheduled appointments.

### Financial and operations

- Revenue by doctor: completed consultation revenue grouped by treating doctor.
- Locum pay: aggregate locum payroll total for the selected month.
- Approved OT: aggregate locum approved overtime hours and pay.
- Daily patient and waiting-time trend.
- Initiatives A, B and C as manual status/action records.

### Stock and inventory

- Stock purchase percentage: selected-period stock purchases divided by comparison-period revenue, with a warning above 25%.
- Expired stock count: inventory batches at or past expiry.
- Stock revenue versus current COGS.
- Stock margin percentage: `(stock revenue - stock COGS) / stock revenue * 100`.
- Manual stock availability feedback.

## Manual monthly metrics

Growth and marketing records include Google rating, Google review count, Facebook/Instagram/TikTok follower growth, weekly post counts for Facebook/Instagram/TikTok/Threads, Facebook lead count, HQ shooting session status, outreach visits, community health events, and visibility initiatives 2/3/4.

Governance records include monthly marketing meeting, monthly staff meeting W1, weekly staff CME W2/W4, NSEP W3, doctor alignment meeting, doctor CME, V2V session and Clinic Manager Meeting.

Each manual record stores clinic/month, metric key, target, actual value, status, notes, editor identity and timestamps.

## Data architecture

- Automatic metrics read existing queue, consultation, appointment, billing, payment, panel claim, inventory, COGS and payroll data.
- Financial values use the same dual-ledger calculation already used by billing, visit detail, receipts and Insight.
- A staff-authorized reporting RPC or equivalent query returns a stable dashboard contract for a selected month.
- Missing doctor attribution is represented as `Unassigned`; incomplete financial attribution is represented as `Incomplete` with an explanation.
- Manual records use a dedicated month-scoped table with a unique `(clinic_id, month, metric_key)` key and audit columns.
- RLS policies permit non-locum reads and restrict writes to admin/doctor-admin roles.

## Failure handling

- Each module loads independently; one failed metric does not blank the entire dashboard.
- Loading, unavailable-data and permission states explain the affected metric.
- Date boundaries use the clinic's Asia/Kuala_Lumpur local-day convention.
- Automatic and manual values are visually distinguished.

## Validation and rollout

- Add unit and component tests for formulas, role access, month switching, manual edit permissions, aggregate payroll privacy and incomplete attribution.
- Add migration contract tests for tables, RPCs, indexes and RLS.
- Run the focused tests, full production build, `git diff --check`, Security Gate and GitHub Pages deployment.
- Do not change the existing `/clinic/insight` access rules or current billing/consultation workflows.
