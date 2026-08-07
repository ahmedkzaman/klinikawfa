# Visit Status Labels and Billing Sorting

## Scope

Improve two existing clinic billing interfaces without changing stored data or permissions.

## Visit status labels

On the visit-record header, replace the two ambiguous standalone status badges with explicitly labelled badges:

- `Queue: <queue status>`
- `Consultation: <consultation status>`

Each badge continues to use the existing status colour. The consultation badge is omitted only when no consultation exists.

## Billing sorting

On the Billings ledger, make these headers interactive:

- Date
- Subtotal
- Paid
- Outstanding
- Method

Clicking a sortable header selects that field and toggles between ascending and descending order. The active header displays a directional arrow. The default remains Date descending (newest first).

Sorting is applied after the existing date-range and tab filters, so it only reorders the rows currently visible in Paid, Outstanding Panel, or Outstanding Self-Pay. Method sorting uses the displayed payment-method label, with missing methods last.

Queue and Patient remain non-sortable because they were not requested.

## Testing

- Verify the visit header identifies Queue and Consultation independently.
- Verify the default Billing order is newest first.
- Verify each requested header toggles direction.
- Verify numeric columns use numeric rather than text ordering.
- Verify Method uses its displayed label and handles missing values consistently.
