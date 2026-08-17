# Klinik Awfa Insight Information Architecture

**Date:** 16 August 2026

**Status:** Approved design direction; pending written-spec review

**Surface:** `/clinic/insight`

**Mode:** Operate

## 1. Purpose

Insight is Klinik Awfa's read-only decision centre. It must help authorised staff understand clinic health, reconcile financial activity, assess doctor and service performance, and plan staffing without forcing them to interpret disconnected reports.

The redesign consolidates the existing seven top-level tabs into four job-based sections:

1. Command Centre
2. Finance
3. Performance
4. Planning

The design preserves existing source ledgers, billing calculations, visit records, reports, and the standalone Management Dashboard. It changes information architecture, presentation, drill-down behaviour, data-confidence communication, and query activation.

## 2. Audience and access

### Special admin and doctor admin

- Access all four sections.
- See named doctor comparisons and full financial contribution details.
- See locum activity in aggregate and doctor-level detail.
- Access visit-level financial and clinical-activity drill-downs allowed by existing permissions.

### Resident doctor

- Access Command Centre, permitted Finance summaries, Performance, and Planning.
- See their own named detailed performance.
- See other doctors only as anonymised clinic benchmarks.
- Cannot access another doctor's visit-level financial detail unless separately authorised by existing permissions.

### Operations staff

- Access Command Centre, operational Finance views, service performance, and Planning as allowed by their account permissions.
- See clinic totals and service performance.
- Do not see named doctor financial comparisons.

### Locum and guest

- No access to Insight.

Account-specific permission overrides continue to take precedence within the eligible special-admin, doctor-admin, resident-doctor, and operations roles. They cannot grant Insight access to locum or guest accounts.

## 3. Global page behaviour

### Header

The page title becomes **Clinic Insight**. The subtitle describes it as the clinic's operational, financial, performance, and planning workspace.

Global controls:

- Date range
- Today
- This month
- Compare with previous equivalent period
- Export menu
- Last refreshed time
- Data-confidence indicator

Additional quick periods live inside the date-range control instead of occupying permanent header space. The selected date range and active section persist during navigation within the session. The active section is also represented in the URL so authorised users can return to a specific Insight section.

### Export menu

The single Export menu contains:

- Consultation line items
- Collected payments
- Daily consultation revenue
- Panel claims
- Outstanding balances
- Financial alerts
- Full reconciliation
- Doctor performance, subject to permission
- Service performance

Every export includes its selected range, generation time, metric-definition version, relevant visit and queue identifiers, payment category, and data-quality flags.

### Data confidence

Every material KPI exposes:

- Definition
- Calculation date basis
- Source category
- Last refresh time
- Affected missing-data count
- Confidence state: Reliable, Partial, or Insufficient

Percent comparisons are hidden when the comparison baseline is incomplete, near zero, or materially affected by missing attribution. The UI shows an absolute difference and `Comparison unavailable` instead.

## 4. Command Centre

Command Centre is the default section and must communicate clinic status within approximately 15 seconds.

### Primary status strip

The first row contains:

- Patients seen
- Average waiting time
- Visit billing
- Patient collections
- Panel receivable
- Critical actions

Each card shows the current value, previous comparable value, reliable change, confidence, and a drill-down action.

The initial redesign omits the existing composite numeric score. A later overall state of **Healthy**, **Watch**, or **Critical** can be introduced only when all contributing rules and deductions are inspectable.

### Action Centre

Issues are ordered by:

1. Severity
2. RM amount at risk
3. Age
4. Affected-record count

Issue groups:

- Money: unpaid self-pay, payment mismatch, duplicate or excess payment
- Panels: unsubmitted, rejected, overdue, or unattributed claims
- Billing: zero-price items, missing charges, bill corrections
- Clinical records: missing notes, diagnosis, dispense note, or doctor attribution
- Inventory: out of stock, below reorder level, expiring stock, or missing COGS

Each issue displays description, affected count, RM exposure, oldest record, responsible team, recommended action, `Open records`, `Download CSV`, and `Mark reviewed`.

Zero-count alerts are hidden. An alert that cannot be calculated reliably appears under Data Quality rather than inheriting an operational severity.

### Today's patient flow

Show registered, waiting, serving, dispensary, completed, no-show, median waiting time, and longest current wait. Clicking a stage opens the corresponding filtered Queue view.

### Attendance summary

Show the busiest attendance period, quietest eligible period, current roster coverage, current regression recommendation, and confidence. Full analysis remains under Planning.

### Data-confidence drawer

The drawer explains missing attribution, missing COGS, inferred historical timestamps, incomplete comparisons, and the metrics affected by each limitation.

## 5. Finance

Finance separates billed work, actual collection, and receivables.

### Internal navigation

- Summary
- Collections
- Panels
- Costs & Margin
- Reconciliation
- Advanced: Bank Health and Valuation

### Summary metrics

- Visit billing
- Patient collected
- Panel billed
- Panel received
- Patient outstanding
- Panel outstanding
- COGS
- Gross profit
- Gross margin
- Average bill

Every metric labels its governing date: visit completion, payment collection, claim creation, or claim receipt.

### Collections

Physical payment categories:

- Cash
- QR Pay
- Card
- E-wallet
- Transfer
- Other

Split payments display combined labels such as `Cash + QR Pay`. Panel co-payments display `Panel: {provider} + Copay`. Panel allocation markers are never counted as patient collections.

Clicking a method opens payment rows, visits, collection dates, payment portions, and receipt links.

### Panels

Lifecycle states:

- Billed
- Unsubmitted
- Submitted
- Approved
- Received
- Rejected
- Overdue
- Outstanding

The panel table shows panel name, claim count, billed, received, outstanding, average age, oldest claim, rejection rate, and submission completion rate. Panel and claim rows link to the correct claim and visit.

### Costs & Margin

Show revenue, COGS, gross profit, gross margin, and missing-COGS exposure. Grouping options are procedure/service, medicine, doctor, panel, and payment type. Missing-cost, zero-cost, and negative-margin rows link to their source items.

### Reconciliation

The page visibly reconciles:

`Visit billing - discounts + tax - refunds = net billed`

`Patient collected + panel received + outstanding = accounted value`

Exception types include payment mismatch, duplicate or excess payment, unattributed payment, missing panel claim, cross-visit payment, corrected or voided bill, and incomplete historical attribution.

### Bank Health and Valuation

Bank Health is an advanced liquidity and receivables view. Valuation is explicitly labelled a scenario tool, not an official accounting valuation.

## 6. Performance

Performance explains which doctors and clinical services drive activity and financial results without reducing a doctor to one composite score.

### Global Performance filters

- Date range
- Doctor
- Payment type: All, Self-pay, Panel
- Activity: All, Consultation, Procedure, Document
- Previous equivalent period comparison

### Clinic Performance overview

Primary indicators:

- Completed clinical visits
- Clinical revenue
- Gross profit
- Revenue per visit
- Procedures performed
- Documents issued

Context indicators:

- Total rostered doctor hours
- Patients per rostered hour
- Revenue per rostered hour
- Self-pay versus panel mix
- Data completeness

### Doctor table

Columns:

- Completed visits
- Rostered hours
- Patients per hour
- Clinical revenue
- Gross profit
- Revenue per hour
- Procedures
- MCs
- Quarantine letters
- Referral letters
- Consultation-note completeness
- Reliable trend versus previous period

The default sort is completed visits. Authorised users may sort by other columns.

### Doctor detail

Clicking a doctor opens a detail drawer or full-width section.

#### Workload

- Visits by date and shift
- Patients per hour
- Average visit duration
- Self-pay and panel mix

#### Financial contribution

- Revenue, COGS, gross profit, and margin
- Revenue per visit
- Revenue per rostered hour
- Payment and panel attribution confidence

#### Clinical activity

- Procedures with quantity, charged price, COGS, and profit
- Diagnoses encountered
- Medicines dispensed
- Documents issued
- Clickable queue numbers leading to visit history

#### Quality guardrails

- Missing consultation notes
- Missing diagnosis
- Missing dispense note
- Returned offline consultations
- Incomplete doctor attribution
- Bills corrected after completion

These are factual completeness and workflow exceptions, not medical-quality judgements.

### Service and procedure performance

Each service or procedure shows:

- Number performed
- Unique patients
- Revenue
- COGS
- Gross profit
- Margin
- Average charged price
- Demand trend
- Number of doctors performing it
- Missing-cost or zero-price warning

The service drill-down shows demand trend, doctor contribution subject to permission, self-pay and panel mix, visit details, current price and COGS, and margin history.

## 7. Planning

Planning converts historical activity into staffing and operational decisions.

### Attendance periods

- 8am-12pm
- 12pm-4pm
- 4pm-8pm
- 8pm-12am

Each weekday-period cell shows average clinical visits, regression expectation, historical peak, confidence interval, average waiting time, comparable operating days, and roster coverage.

Clicking a period opens hourly detail, historical trend, rostered doctors, arrivals, waiting-time distribution, unusual peak dates, and payment-type mix.

### Regression recommendations

Possible outputs:

- Suitable doctor off-day
- Suitable staff training period
- Additional doctor coverage recommended
- Extend or reduce shift coverage
- Insufficient data to recommend

Every recommendation states its rationale, expected attendance, worst-case upper estimate, historical peak, roster coverage, confidence, and invalidating conditions.

A low-average weekday with an isolated high peak may remain eligible when the regression upper estimate and coverage safeguards are acceptable.

### Doctor-hours planning

Roster shifts remain:

- Shift 1: 8am-1pm
- Shift 2: 2pm-7pm
- Shift 3: 8pm-12am

Show required versus rostered doctor hours, coverage gaps, doctor-type contribution, patients per rostered hour, revenue per rostered hour, and suggested minimum coverage.

Individual salary information is excluded. Authorised management users may see total approved OT hours/pay and aggregate locum pay.

### Demand forecasting

Forecast visit volume, service/procedure demand, medication demand, and panel/self-pay mix. Forecasts use ranges and expose confidence and data sufficiency.

### Operational calendar

Show safer off-days, preferred training periods, expected busy days, public-holiday considerations, planned marketing events, and roster gaps. Recommendations never alter rosters automatically.

### Management Dashboard boundary

The standalone Management Dashboard continues to own marketing tracking, Google reputation, meetings and governance, stock-purchase targets, revenue targets, and manual management inputs. Planning links to it without duplicating it.

## 8. Responsive and accessibility requirements

### Mobile

- Summary metrics use a compact swipeable strip with a visible position cue.
- Action Centre follows immediately after the primary status.
- Date range collapses into one control.
- Exports live in an overflow menu.
- Section navigation uses a horizontally scrollable tab row or accessible selector.
- Wide tables become stacked records with detail drawers.

### Accessibility

- Interactive targets are at least 44 by 44 CSS pixels where practical.
- Keyboard focus is visible and follows logical order.
- Charts include written conclusions and accessible tabular alternatives.
- Severity and trend never rely on colour alone.
- Loading, empty, partial, error, and stale states use semantic status messaging.
- Headings follow a consistent hierarchy.

## 9. Performance and loading behaviour

- Only the active top-level section loads its primary datasets.
- Drill-down datasets load on demand.
- Changing the date range invalidates only affected queries.
- Previous visible data remains while refreshing, with an explicit updating state.
- Expensive tables use server pagination or bounded queries.
- Existing access-check console errors must be corrected before the redesigned surface is considered complete.

## 10. States and edge cases

Each section supports:

- Loading
- Empty period
- Partial data
- Data unavailable
- Permission restricted
- Stale data
- Export failure
- Excessively large date range
- Incomplete comparison period
- Missing doctor attribution
- Missing COGS
- Historical inferred timestamps

No state may silently substitute zero for unavailable data.

## 11. Boundaries and anti-goals

- Do not modify authoritative billing or dual-ledger calculations as part of the information-architecture change.
- Do not generate clinical decisions or medical-quality rankings.
- Do not expose named doctor financial comparisons to operations staff.
- Do not permit Insight recommendations to alter rosters automatically.
- Do not duplicate the standalone Management Dashboard.
- Do not retain seven competing top-level tabs.
- Do not display unreliable percentage comparisons.
- Do not use a single composite doctor score.
- Do not treat missing data as zero.

## 12. Success criteria

The redesign is successful when:

- An authorised user can identify the clinic's most important current issue within 15 seconds.
- Billed, collected, received, and outstanding amounts are visibly distinct.
- Every action alert links to affected records and explains the recommended resolution.
- Doctor and service performance are available under the approved role rules.
- Regression staffing recommendations remain explainable and guarded.
- Mobile users reach actionable content without traversing a screen of filters and exports.
- Inactive sections do not trigger their expensive data queries.
- Unreliable data is visibly qualified rather than presented as authoritative.
