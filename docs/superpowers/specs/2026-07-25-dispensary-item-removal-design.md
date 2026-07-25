# Dispensary Item Removal Design

## Goal

Allow every clinic account except locum to remove medicines, services,
packages, and manual charges from an active dispensary visit.

## Data Integrity

Removal remains a soft delete on `consultation_items`. The database stamps
`deleted_at` and `deleted_by`, preserving the audit trail. The existing
inventory trigger releases reserved stock when an active medicine becomes
soft-deleted. Active-item queries and billing totals already exclude deleted
rows.

## Authorization

The frontend calls a dedicated `remove_consultation_item_dispensary` security
definer function. The function requires an authenticated caller accepted by
`can_edit_dispensary_prices`, which includes clinic roles and excludes locum.
It scopes deletion to one active item and its consultation.

## Interaction

Every editable item row retains its trash icon. Clicking it opens a confirmation
dialog naming the item. Confirming removes the item; cancelling leaves it
unchanged. The action is disabled while the request is pending.

## Testing

Regression tests verify the hook uses the guarded RPC, the database function
checks authorization and scopes the item, the UI has confirmation, and locum
remains blocked by the existing dispensary edit gate.
