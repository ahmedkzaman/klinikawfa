# Patient Attendance Heatmap and Google Reputation Design

## Goal

Extend the existing Management Dashboard with two decision-support improvements:

1. A clinical-attendance heatmap that shows when patients normally arrive and suggests safer training, off-day and peak-staffing periods.
2. Automatic Google rating and review-count data in the existing Growth & Marketing cards.

The feature supports scheduling decisions. It does not automatically change rosters, approve leave or close the clinic.

## Placement and access

- Add the attendance heatmap to `/clinic/dashboard` as a new dashboard section.
- Keep the existing `Google rating` and `Google reviews` cards in Growth & Marketing; enhance those cards instead of adding a separate Google section.
- Reuse the current Management Dashboard view permission and administrator edit permission.
- Do not expose patient names, identifiers, visit notes or individual employee salary information in either report.

## Clinical attendance definition

The primary metric is clinical patient arrival, not general footfall.

- Count each qualifying queue visit as one attendance event, including repeat visits by the same patient.
- Use the queue arrival/check-in timestamp and convert it to `Asia/Kuala_Lumpur` before assigning the date, weekday and hour.
- Include consultations regardless of payment method: cash, card, QR/e-wallet, other self-pay and panel.
- Exclude OTC/payment-only visits, cancelled registrations and records without a trustworthy arrival timestamp.
- Exclude imported rows whose arrival time was synthesized rather than supplied by the source system.
- A visit spanning midnight belongs to the weekday and hour in which the patient arrived.

## Default period and filters

- Default to the latest 12 weeks, inclusive of the current Malaysia-local day.
- Provide presets for latest 12 weeks, selected month and selected quarter.
- Provide a custom inclusive start/end date range.
- Provide an `All doctors` default and an optional treating-doctor filter.
- One-hour slots run from `08:00–09:00` through `23:00–00:00`.
- Columns run Monday through Sunday.

The comparison period is the immediately preceding period of equal length. For the 12-week default, compare with the preceding 12 weeks.

## Operating-day denominator

The heatmap reports average arrivals per comparable operating slot, not total visits divided by every calendar occurrence.

- For `All doctors`, a weekday-hour occurrence is operating when at least one non-cancelled doctor roster assignment overlaps the slot.
- For a selected doctor, it is operating when that doctor's non-cancelled roster assignment overlaps the slot.
- Closed or uncovered slots are grey and are not treated as zero demand.
- If roster history is insufficient, show the raw visit total but mark the average and recommendation confidence as insufficient rather than inventing an operating-day denominator.

## Heatmap presentation

Each cell displays average clinical arrivals per operating occurrence.

- Grey: closed, uncovered or insufficient data.
- Light blue: quieter periods.
- Progressively darker blue: busier periods.
- Red outline: average waiting time exceeds 45 minutes despite the recorded arrival volume.

The colour scale is calculated within the selected period so relative quiet and busy periods remain visible. A legend displays the numeric range.

Clicking a cell opens a detail panel containing:

- Total clinical visits.
- Average, median and peak arrivals.
- Number of operating dates sampled.
- Average waiting time and the number of visits with a valid waiting-time measurement.
- Percentage and absolute change from the preceding comparison period.
- The individual dates and visit counts behind the aggregate, without patient identities.

## Decision-support cards

Recommendations require at least eight comparable operating occurrences. Every recommendation displays its sample size and supporting values.

### Best training windows

- Find recurring quiet periods of at least two consecutive operating hours.
- Candidate hours must fall within the bottom quartile of average attendance.
- Suppress the recommendation when the slot has a high peak, high variability or average waiting time above 45 minutes.

### Possible doctor off-day

- Identify the weekday with the lowest average clinical attendance.
- Do not recommend a day whose peak hour falls in the busiest quartile.
- Show this as `Possible doctor off-day`, never as an automatic roster instruction.
- When a doctor filter is selected, also require other scheduled doctor coverage before suggesting that doctor's off-day.

### Peak staffing periods

- Highlight weekday-hour cells in the busiest quartile.
- Also highlight cells with average waiting above 45 minutes even when arrival volume is not in the busiest quartile.

### Unstable periods

- Flag cells where occasional peaks materially exceed the typical volume, so a low average is not mistaken for a reliably quiet period.
- Display the median and peak behind the warning.

## Attendance data contract

Create a staff-authorized aggregate reporting RPC with inputs for start date, end date and optional doctor ID. It returns:

- Selected and comparison date boundaries.
- Hourly cells containing weekday, hour, totals, operating occurrences, average, median, peak, waiting-time measures and comparison values.
- Data-coverage warnings.
- Precomputed recommendation evidence or sufficient aggregate inputs for deterministic client-side recommendations.

The database performs the aggregation. The browser must not download identifiable visit rows to build the heatmap. Date and roster filtering require appropriate indexes and bounded date ranges.

## Automatic Google reputation cards

Use the official Google Business Profile Reviews API for the verified Klinik Awfa location. The clinic owner completes a one-time OAuth connection after the Google Cloud project receives Business Profile API access.

The Reviews API provides `averageRating` and `totalReviewCount`. Google documents the API at:

- <https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list>
- <https://developers.google.com/my-business/content/prereqs>
- <https://developers.google.com/my-business/content/pricing>

Do not scrape Google Search or Google Maps result pages.

### Synchronization

- Run one scheduled synchronization daily.
- Permit an administrator-triggered refresh with throttling.
- Store one verified snapshot per Malaysia-local day containing rating, total review count, observed date, sync timestamp and source location ID.
- Preserve snapshots so monthly changes and historical trends remain available even though Google supplies current totals.
- Store OAuth credentials only in server-side encrypted secrets. Never send the refresh token or client secret to the browser.

### Google rating card

- Display the latest verified average as `x.x / 5`.
- Retain the editable rating target, initially `4.5`.
- Display last successful synchronization time and a compact recent trend.
- The Google-supplied actual value is read-only.

### Google reviews card

- Display the latest verified total review count.
- Display `+N this month`, calculated from daily snapshots.
- Treat the editable target as a monthly new-review target, initially `100/month`, rather than comparing the lifetime total directly with 100.
- If no month-opening baseline exists, show monthly growth as unavailable until enough snapshots have accumulated.

### Google failure handling

- If synchronization fails, retain the most recent verified values and label them stale.
- Never replace a failed sync with zero.
- Show the last successful sync and a concise administrator-only connection error.
- Require explicit reconnection if Google OAuth access is revoked.

## Testing and verification

Attendance verification covers:

- Malaysia-local date, weekday and midnight boundaries.
- Rolling 12-week and equal-length comparison periods.
- Exclusion of payment-only, cancelled and untrustworthy imported rows.
- Inclusion of all clinical payment methods.
- All-doctor and selected-doctor roster denominators.
- Closed-slot handling and insufficient roster coverage.
- Average, median, peak, waiting-time and recommendation calculations.
- The eight-occurrence minimum and suppression of risky training/off-day recommendations.
- Aggregate-only response privacy and Management Dashboard authorization.

Google verification covers:

- OAuth connection and location selection.
- Daily idempotent snapshots.
- Rating and total review count mapping.
- Monthly review-growth calculation and target semantics.
- Stale-data behaviour, revoked access and API failures.
- Protection of server-side credentials.

Release verification includes focused tests, database contract tests, type checking, changed-file linting, a production build, migration dry run, Security Gate and GitHub Pages deployment.

## Out of scope

- Automatic roster modification, leave approval or clinic closure.
- General OTC/payment-only footfall heatmaps.
- Predictive machine-learning attendance forecasting.
- Scraping Google Search, Google Maps or competing clinics.
- Importing or displaying individual Google review text in this phase.
