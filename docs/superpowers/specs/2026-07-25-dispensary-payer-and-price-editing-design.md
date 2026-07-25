# Dispensary Payer and Price Editing

## Goal

Allow every authenticated clinic role except `locum` to edit treatment prices
and payer details during dispensary checkout. Operation staff must be able to
use the workflow whether the queue entry is `sent_to_dispensary` or
`dispensing_payment`.

## Behavior

- Treat both `sent_to_dispensary` and `dispensing_payment` as active dispensary
  stages that bypass a doctor's stale consultation lock.
- Keep all dispensary item editing disabled for `locum`.
- Add a payer control to checkout with `Self Pay` and `Panel` choices.
- When `Panel` is selected, require an active panel provider.
- Save the selected payer to the queue entry before checkout calculations are
  used.
- When switching to self pay, clear `panel_id` and use `cash` as the queue
  payment method.
- When switching to panel, save the selected `panel_id` and use `panel` as the
  queue payment method.
- Refresh panel pricing, discounts, and payable amounts from the saved payer.
- Disable payer changes while a save is pending and report save failures
  without leaving the screen in a misleading state.

## Authorization

The frontend permission remains `!isLocum`. Database policies remain the final
authority. Existing production policies already permit the legacy
`operations` role to update active queue entries and consultation items.

## Testing

- Regression test that both dispensary statuses bypass a stale consultation
  lock for non-locum users.
- Regression test that locum remains unable to edit.
- Regression test for self-pay and panel queue-entry update payloads.
- Run the focused tests, full build, and deployment checks before publishing.

## Scope

This change does not alter inventory master prices, panel-provider settings, or
historical completed visits.
