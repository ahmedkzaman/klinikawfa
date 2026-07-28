# Top Medications by Dispensed Patient Visits

## Goal

Change Insight > Scoreboards > Top 10 Medications so it ranks medicines by
the number of distinct completed patient visits in which each medicine was
dispensed, rather than by medicine revenue.

## Counting Rule

- Count one distinct queue entry per medicine.
- Multiple lines for the same medicine in one queue entry count once.
- Include only medication consultation items from completed consultations.
- Exclude soft-deleted consultation items and consultations.
- Exclude items whose effective dispensed quantity is zero.
- Use `dispensed_qty` when present; otherwise use `quantity` for legacy rows.
- Group equivalent rows by the medication item identity when available, with
  normalized medicine name as the legacy fallback.

## Data Flow

The scoreboard data source will expose the effective dispensed quantity and
medication identity needed by the client aggregation. The scoreboard hook will
accumulate a set of queue-entry IDs for each medicine and derive
`dispensedVisitCount` from the set size.

## User Interface

- Keep the existing Top 10 Medications chart location and layout.
- Change the subtitle to `By patient visits dispensed`.
- Plot `Patient Visits` as the bar value.
- Format the horizontal axis and tooltip as whole visit counts, not currency.
- Sort descending by patient visit count and retain the top ten.

## Error And Legacy Handling

Older rows without `dispensed_qty` use billed `quantity`. Rows lacking a stable
medication ID are grouped by normalized display name. The existing Scoreboards
error and empty states remain unchanged.

## Verification

- Unit test distinct-visit counting and duplicate-line deduplication.
- Test deletion and zero-dispensed exclusions.
- Test descending visit-count ordering.
- Test chart labels and removal of revenue formatting.
- Run focused tests, lint, type checks, and production build before deployment.
