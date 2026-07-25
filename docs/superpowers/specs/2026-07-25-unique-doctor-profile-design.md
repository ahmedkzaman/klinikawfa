# Unique Doctor Profile Repair

## Goal

Restore the Consultation page and prevent the current-doctor lookup from ever
receiving multiple doctor rows for one account.

## Data Repair

- Keep the oldest doctor row for each `user_id`.
- Repoint any consultation and queue-entry references from duplicate rows to
  the retained row.
- Delete only duplicate doctor rows after references are moved.
- Add a partial unique index on `doctors(user_id)` where `user_id IS NOT NULL`.

## Application Behavior

- Continue returning no doctor row for non-clinical users.
- For clinical users without a row, attempt auto-provisioning.
- If another request creates the row first, re-query and return that row.
- Order defensive lookups by creation time and limit them to one row so legacy
  drift cannot blank the page while a repair is being deployed.

## Verification

- Test the lookup source for deterministic, limited queries and race fallback.
- Verify no duplicate linked doctors remain in production.
- Verify the unique index exists.
- Run the complete protected GitHub gate and production deployment.
