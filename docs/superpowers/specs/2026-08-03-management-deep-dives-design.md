# Clinic Management Deep Dives Design

**Date:** 2026-08-03
**Status:** Approved design
**First implementation package:** Financial Control

## Objective

Extend the existing clinic Insight page with action-oriented management reporting. The
dashboard must help managers detect problems, reconcile the underlying records, and
open the exact visit, bill, claim, item, or staff record that needs attention.

The first package adds Financial Control. Later packages add Patient Flow, Inventory
Control, Clinical Quality, Growth and Retention, Staffing and Capacity, and Patient
Feedback.

## Product Structure

Add a `Management` tab to the existing `/clinic/insight` page. Management contains
separate deep-dive views that reuse one shared date filter, comparison period,
Malaysia timezone rules, alert presentation, paginated drill-down pattern, and CSV
export behavior.

The rollout order is:

1. Financial Control
2. Patient Flow
3. Inventory Control
4. Clinical Quality
5. Growth and Retention
6. Staffing and Capacity
7. Patient Feedback

The first implementation must not introduce placeholder screens for later phases.

## Approach

Extend the current Insight experience rather than creating a second management
application or replacing the analytics system. This preserves existing navigation,
access control, date selection, and familiar reporting behavior.

Financial calculations live in PostgreSQL and are exposed through bounded,
permission-checked reporting functions. The browser formats and presents report
results but does not independently reconstruct financial totals. Summary figures,
drill-down rows, and CSV exports therefore share one calculation contract.

## Financial Control

### Date Semantics

The report distinguishes three concepts that must never be presented as one figure:

- **Billing cohort:** visits whose bills were completed in the selected period.
- **Cash collection:** payments received in the selected period, including payments
  against older bills.
- **Outstanding as of date:** unpaid balances that remain at the selected end date.

The default range is the existing Insight default. Quick ranges and the maximum
one-year custom range remain available. Comparison uses the immediately preceding
period of equal length.

### Summary Metrics

The primary summary shows:

- Billed revenue
- Cash collected
- Collection rate for the selected billing cohort
- COGS
- Gross profit
- Gross margin percentage
- Billing-cohort outstanding
- Total outstanding as of the end date
- Average bill per completed visit

Every amount links to the rows that compose it. Billed revenue and collected cash
must always use explicit labels and separate visual treatment.

### Calculation Rules

- Billed revenue uses the latest valid state of completed patient bills.
- All active charges are included: medicines, procedures, services, packages,
  consultation fees, official-document fees, manual charges, taxes, and other valid
  billing adjustments.
- Discounts, refunds, voids, taxes, and completed-bill corrections remain separately
  identifiable and are not silently folded into unrelated categories.
- Medicine COGS is the stored dispensing-time unit cost multiplied by the quantity
  actually dispensed.
- Procedure, service, and package COGS uses the configured cost snapshot when one
  exists.
- Gross profit is recognized billed revenue less attributable COGS.
- Deleted or voided financial rows are excluded from active totals but remain
  discoverable in the audit drill-down.
- Panel outstanding is the valid claim amount less received amount, bounded at zero,
  for claims still financially active.
- Self-pay outstanding is the latest valid bill total less valid payments allocated
  to that bill, bounded at zero.
- Monetary reconciliation tolerance is RM0.01.
- Missing or zero cost does not silently remove a bill from revenue. The affected
  item contributes known revenue, contributes no invented cost, and appears in the
  data-quality exception list so the reported margin cannot be mistaken for complete.

### Management Alerts

Financial Control reports actionable exceptions:

- Completed self-pay bill unpaid after 24 hours
- Panel claim not submitted after two working days
- Panel claim past its due date
- Dispensed medicine with missing or zero unit cost
- Zero-price medicine, procedure, service, package, or manual charge
- Negative-margin item or visit
- Discount above the configured threshold
- Refund, void, or completed-bill correction
- Bill/payment difference greater than RM0.01
- Duplicate or excess payment

Initial thresholds use documented server defaults. A later settings enhancement may
make the discount and aging thresholds configurable without changing metric
definitions.

### Drill-Downs

Clicking a summary, chart segment, or alert opens a paginated detail table containing
only fields relevant to financial management:

- Visit date and queue number
- Patient name
- Attending doctor
- Payment type and method
- Billed, paid, and outstanding amounts
- COGS, gross profit, and margin
- Discounts, refunds, voids, and corrections
- Panel provider, claim status, submission date, due date, and amount received
- Direct links to the existing visit and bill screens

Margin analysis can group by medicine, procedure/service, package, doctor, payment
type, and panel provider. Financial drill-downs do not expose unrelated clinical
notes.

### Reconciliation

The page includes:

- Billed revenue by completion date
- Cash collected by payment date
- Collections attributable to the selected billing cohort
- Collections received for older bills
- Billing-cohort outstanding
- Total self-pay and panel outstanding as of the selected end date
- Discounts, refunds, voids, taxes, and corrections as separate movements

The report labels any number that cannot fully reconcile because of missing source
data and links directly to the exception rows.

## User Experience

Financial Control is a quiet operational workspace rather than a card-heavy
marketing dashboard. It uses a compact summary strip, a reconciliation section,
an alert table ordered by urgency, and dense analytical tables suitable for repeated
management use.

Each section loads independently. A failure in one report does not blank the entire
Insight page. Empty periods show explicit zero states. Every section shows its data
timestamp, and exports reproduce the same filtered server result shown on screen.

Existing Insight access permissions remain authoritative. No new access is granted
merely by adding the Management tab.

## Data Architecture

Create a bounded server-side financial-control reporting boundary that combines:

- consultations and consultation items
- queue entries and patients
- payments and debt settlements
- panel claims and receipts
- completed-bill corrections and their immutable audit history
- dispensing-time cost snapshots
- attending doctors and panel providers

Use stable metric definitions shared by the summary and drill-down functions. Large
detail sets use server-side pagination and deterministic ordering. Reporting
functions validate the caller's Insight permission and do not accept a user ID as a
substitute for the authenticated identity.

The existing financial view and sales aggregation remain supported for current
Insight screens. Financial Control may reuse them where their metric meaning is
identical; otherwise the new server report becomes the canonical source for the new
metric only. Existing calculations are not silently redefined.

## Reliability And Error Handling

- All date boundaries use `Asia/Kuala_Lumpur`.
- Invalid ranges and ranges longer than one year are rejected consistently.
- Monetary values use database numeric arithmetic and explicit rounding.
- Summary values are checked against their drill-down aggregates.
- Report sections return bounded error states without revealing database internals.
- CSV exports use the current filters and the same canonical report contract.
- Query keys include the complete date, comparison, grouping, alert, and page state.

## Verification

Database contract tests cover:

- Fully paid and partially paid self-pay visits
- Payments for older debts received in the selected period
- Submitted, overdue, partially received, and settled panel claims
- Discounts, taxes, refunds, voids, and completed-bill corrections
- Medicines with full, partial, zero, or missing dispensing-time cost
- Procedures, packages, manual charges, and official-document fees
- Negative margins, duplicate payments, and overpayments
- Malaysia local-date boundaries
- Reconciliation between every summary metric and its detail rows
- Unauthorized and locum access attempts according to existing Insight permissions

Frontend tests cover independent section failures, empty states, filtering,
comparison labels, alert drill-downs, pagination, visit/bill navigation, and CSV
parity.

## Later Deep Dives

### Patient Flow

Measure waiting time by queue stage, total visit duration, bottlenecks,
cancellations, and no-shows.

### Inventory Control

Measure stockouts, expiry exposure, dead stock, stock-adjustment variance, and
purchasing demand.

### Clinical Quality

Measure revisits, incomplete diagnoses or notes, pending approvals, and agreed
prescribing indicators.

### Growth And Retention

Measure new and returning patients, visit frequency, service demand, and retention.

### Staffing And Capacity

Measure patient volume per staffed hour, workload distribution, overtime, and
capacity pressure without turning clinical complexity into a simplistic staff rank.

## Later Patient Feedback Module

Patient Feedback is a separate future package. Staff can generate a secure,
visit-specific QR code and a prefilled WhatsApp sharing link. The initial sharing
flow uses WhatsApp's normal click-to-chat behavior and does not require paid WhatsApp
API automation.

The public feedback form requires no patient login and supports:

- Overall experience rating
- Waiting-time, doctor, staff, and dispensary ratings
- Complaint and compliment categories
- Written feedback
- Optional request for follow-up
- One accepted response per expiring visit token
- Urgent complaint escalation
- Aggregate management trends without exposing clinical notes

Tokens must be unguessable, revocable, purpose-limited, and stored in a form that
does not expose the usable token if the database is read. The feedback design,
retention policy, escalation workflow, and WhatsApp message content require their
own approved specification before implementation.

## Scope Boundary

The first implementation package includes only the shared Management shell and
Financial Control. It does not implement Patient Flow, Inventory Control, Clinical
Quality, Growth and Retention, Staffing and Capacity, QR feedback, or automated
WhatsApp messaging.
