# Panel Consultation Fees and Clinic Health Design

## Objective

Deliver two connected improvements:

1. Make each panel's default consultation fee apply automatically and reliably to new panel visits.
2. Turn Clinic Insight from a mainly financial report into an actionable clinic-health dashboard.

The fee feature supplies accurate panel billing data. The dashboard then makes panel performance, clinic operations, inventory risks, patient retention, and data-quality problems visible.

## Existing System

- Panel profiles already support a nullable `consultation_fee_override`.
- The panel edit form already exposes this value as “Consultation Fee Override (RM).”
- New consultations currently seed the clinic-wide default cash consultation fee from clinic preferences.
- A database pricing trigger attempts to replace a matching free-text consultation fee with the panel override.
- Clinic Insight currently includes financial overview, scoreboards, leaderboards, valuation, and bank-health views.

The panel pricing behavior is split between the screen and database, which makes the result harder to understand and verify. Clinic Insight also lacks operational, claims, inventory, patient, and data-quality health indicators.

## Product Decisions

### Panel consultation fee

- Rename the field to **Default Panel Consultation Fee (RM)**.
- A blank value means “use the clinic's default cash consultation fee.”
- `0.00` is a valid configured panel fee.
- The selected panel belongs to the queue visit and determines the automatic fee.
- Cash visits continue to use the clinic-wide default cash fee.
- The automatic rule applies when a new consultation-fee row is created.
- Existing and completed bills are not silently repriced when panel settings change.
- A clinician or authorized billing user may still edit a fee after it has been created.

### Clinic Health

- Keep the existing financial views.
- Add an executive Clinic Health view as the default entry point.
- Prefer actionable warnings and comparisons over additional decorative charts.
- Every warning should explain the issue and link to the relevant workflow where practical.
- All metrics respect the selected date range unless explicitly labelled as a live/current-state metric.
- The first release assumes one clinic; branch filtering can be added when the product supports multiple branches.

## Architecture

### Pricing resolution

A single shared pricing rule will express:

1. Panel visit with a configured fee, including zero: use the panel fee.
2. Panel visit with a blank fee: use the clinic cash default.
3. Cash visit: use the clinic cash default.

The consultation screen will resolve and display the correct fee immediately. The database trigger will enforce the same rule as a safety net for any insert path that bypasses the screen.

The queue entry's `panel_id`, rather than the patient's saved default panel, is authoritative for a specific visit. This permits a normally panel-covered patient to attend as cash or under a different panel without corrupting the visit price.

### Insight data

Insight metrics will be grouped behind focused query hooks or database functions:

- Executive health
- Operations
- Panel and claims
- Inventory
- Patients
- Alerts and data quality

Each unit returns presentation-ready aggregates for a bounded date range. Existing financial hooks remain in place and are reused where definitions match. Metric definitions will be centralized so cards, exports, and alerts do not calculate the same KPI differently.

## User Experience

### Panel settings

In **Settings → Panels → Edit Panel**, the billing section shows:

- **Default Panel Consultation Fee (RM)**
- Placeholder: “Leave blank to use default cash fee”
- Help text: “Automatically used for new consultations under this panel. RM 0.00 is allowed.”

Saving a panel retains blank as `null`, not zero.

### Clinic Health overview

The default Insight tab will present:

1. Overall health status and short explanation
2. Revenue, gross profit, patient volume, and waiting-time comparisons
3. Outstanding panel claims and cash-versus-panel mix
4. Inventory risk summary
5. Prioritized action list

The overall score will not hide its inputs. Users can see which dimensions lowered the score and the underlying raw values.

### New insight areas

#### Operations

- Registered, completed, cancelled, and no-show visits
- Average and median queue waiting time
- Average consultation duration
- Current waiting count
- Visits per doctor
- Peak hours and busiest days
- Appointment-to-visit conversion

#### Panels and Claims

- Revenue and visits by panel
- Average consultation fee by panel
- Missing panel consultation fees
- Unsubmitted claims
- Submitted, approved, rejected, and paid claim rates
- Outstanding amount and aging
- Average days to payment
- Unusual billing compared with the panel's configured fee

#### Inventory

- Current stock value
- Below-reorder and out-of-stock items
- Items expiring within 30, 60, and 90 days
- Fast-moving and slow-moving stock
- Medication gross margin
- Reversed or corrected dispensing activity where recorded

#### Patients

- New versus returning patients
- Repeat-visit and retention rates
- Follow-up completion
- Appointment no-show rate
- Common diagnoses
- High-frequency visitors
- Overdue follow-ups

#### Alerts and Data Quality

Examples:

- Completed visits without payment records
- Panel visits without a selected panel
- Consultations without a consultation-fee row
- Active panels with no default consultation fee
- Inventory items missing cost prices
- Claims missing required documents
- Material deterioration in waiting time, revenue, margin, or claim aging

Alerts will use severity levels and provide a direct action where possible.

## Health Score

The executive score will be a transparent composite of:

- Financial health
- Operational health
- Claims and liquidity
- Inventory readiness
- Patient continuity
- Data completeness

Each dimension will show its score, current value, comparison value, and plain-language explanation. Initial thresholds will be conservative defaults and documented in the interface. A later release may make thresholds configurable after real clinic usage establishes reliable baselines.

## Delivery Phases

### Phase 1: Reliable panel consultation fees

- Clarify the panel field
- Centralize fee resolution
- Apply it during consultation creation
- Enforce the same rule in the database
- Cover configured, blank, zero, and cash cases

### Phase 2: Executive Clinic Health and panel visibility

- Add the Clinic Health landing view
- Add period comparisons
- Add panel fee compliance and panel-claim summaries
- Add prioritized alerts for missing or inconsistent billing data

### Phase 3: Operations

- Add queue, consultation-time, volume, no-show, and doctor-load metrics
- Add peak-hour and busiest-day views

### Phase 4: Inventory

- Add stock, reorder, expiry, movement, and medication-margin health

### Phase 5: Patients

- Add acquisition, return, retention, follow-up, and continuity metrics

### Phase 6: Health score refinement

- Validate thresholds against actual clinic data
- Refine weighting and alert sensitivity
- Add configurable targets only where the clinic needs them

## Error Handling and Data Integrity

- Missing panel pricing falls back to the cash fee without blocking consultation.
- A missing or invalid cash default produces a visible warning and avoids creating an unintended positive charge.
- Failed fee creation is surfaced to the user and remains retryable.
- Database enforcement protects non-UI insert paths.
- Insight sections fail independently so one unavailable metric does not blank the full dashboard.
- Insufficient data is labelled clearly; it is not represented as a healthy zero.
- Personally identifiable patient details are excluded from aggregate dashboard cards and exports unless the user opens an authorized patient-level drill-down.

## Testing

### Panel pricing

- Configured positive panel fee wins over the cash default.
- Configured zero panel fee remains zero.
- Blank panel fee falls back to the cash default.
- Cash visits use the cash default.
- The queue visit's panel wins over the patient's saved default.
- Existing consultation items are not retroactively changed.
- Database and frontend pricing rules agree.

### Insight

- Metric calculations use the selected inclusive date range.
- Current-period comparisons use an equal-length prior period.
- Empty and partial datasets show honest states.
- Panel fee-compliance alerts identify missing and mismatched fees.
- Drill-down links preserve the relevant filters.
- Role restrictions continue to protect financial and patient information.
- Existing financial Insight tests remain green.

## Deployment and Rollback

- Ship database migrations before or alongside the frontend that depends on them.
- Migrations must be additive and safe for existing panel rows.
- Existing `null` panel fees remain valid and use the cash fallback.
- Deploy phases independently; later dashboard phases do not block the pricing fix.
- If a dashboard phase fails, its tab can be removed without reverting panel pricing.

## Success Criteria

- A new panel consultation immediately displays the configured panel fee.
- Blank panel fees consistently use the clinic cash fee.
- RM 0.00 panel fees remain free and are not mistaken for blank.
- Cash visits are unchanged.
- Clinic Insight answers, at a glance, whether finances, operations, claims, inventory, patients, and data quality require attention.
- Each critical warning explains what happened and where the user can act.
