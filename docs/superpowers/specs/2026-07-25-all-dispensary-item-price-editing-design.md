# All Dispensary Item Price Editing Design

## Goal

Allow every authenticated clinic account except locum to edit the visit price
of every line item in dispensary.

## Design

The existing `canEditDispensary` UI gate remains the source of truth for
whether controls are visible. It blocks locum and allows other clinic users
during dispensary stages. `VisitDetailsColumn` will render its existing inline
`PriceInput` for medicines, services, packages, and manual charges instead of
limiting it to manual charges.

Price commits continue through `useUpdateConsultationItem`, which calls the
guarded `update_consultation_item_dispensary` database function. The change
updates only the selected consultation item price and does not alter inventory,
service, or package defaults.

## Error Handling

Existing mutation errors remain visible through the price-update toast. Invalid
or unauthorized calls remain rejected by the guarded database function.

## Testing

Add a source-level regression test proving the price editor is not conditional
on catalog foreign keys. Retain the existing tests proving locum is blocked and
the guarded RPC is used. Run the complete release gate before deployment.
