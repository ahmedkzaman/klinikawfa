# Panel Billed Insight Card

## Goal

Add a **Panel Billed** card to the payment summary row in `/clinic/insight` so clinic staff can see how much panel business was expected to be collected during the selected period, including a single selected day.

## Accounting definition

Panel Billed is the sum of `panel_claims.amount` for claims whose `claim_date` is inside the inclusive date range selected on the Insight page.

- Include statuses: `pending`, `submitted`, `approved`, and `received`.
- Exclude statuses: `rejected` and `cancelled`.
- Display the number of included claims beneath the amount.
- Use `amount`, not `approved_amount` or `received_amount`, because the requested measure is the original amount the clinic expected to collect.

## Data flow

Create a focused panel-billing query hook keyed by the selected start and end calendar dates. It reads only `amount` and `status` from `panel_claims`, filters by `claim_date`, excludes rejected and cancelled claims, and returns a total plus claim count.

The query remains separate from collected payments because the two measures have different dates and meanings:

- Collected payment cards use `payments.created_at` and represent cash already recorded.
- Panel Billed uses `panel_claims.claim_date` and represents expected panel receivables.

No database migration or Edge Function is required.

## User interface

Add a fourth summary tile after QR Pay in the existing **Collected Sales** card:

- Label: `Panel Billed`
- Main value: formatted Malaysian Ringgit total
- Supporting text: singular/plural claim count

The tile uses the existing `softTile` styling. The row becomes a responsive four-column grid at the large breakpoint while retaining one column on mobile and the existing stacked behavior at smaller widths. The section remains visible when panel claims exist even if there are no collected-payment method rows.

The **Total Collected** metric and collected-sales chart remain unchanged; Panel Billed must not be added to collected revenue.

## Errors and loading

Panel billing loading participates in the existing Insight loading state. A panel-query failure is shown as a dedicated error message and does not alter collected-payment totals. A successful query with no eligible claims renders `RM 0.00` and `0 claims`.

## Testing

Use test-driven development:

1. Add aggregation tests proving eligible statuses are summed and rejected/cancelled claims are excluded.
2. Add a zero-data test.
3. Add a page/component test proving the Panel Billed card renders the total and claim count without changing collected totals.
4. Run the focused tests, full test suite, lint, and production build.

## Out of scope

- Changing claim status workflows.
- Showing received panel cash or outstanding balance.
- Breaking totals down by insurance provider.
- Adding Panel Billed to collected-sales CSV or charts.
