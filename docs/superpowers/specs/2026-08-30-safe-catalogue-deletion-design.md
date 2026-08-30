# Safe Catalogue Deletion Design

## Purpose

Allow exact-role `admin` and `special_admin` users to remove medications, disposable items, procedures, laboratory investigations, general services, and packages from future use without damaging historical clinical or financial records.

## Decision

The interface will call the action **Delete**, but the system will perform a reversible soft deletion. It will retain the catalogue row and mark it inactive and archived. Physical deletion is intentionally excluded because catalogue identifiers are referenced by consultations, package definitions, panel price overrides, stock records, and reporting data.

## Scope

The change covers the catalogue tabs at `/clinic/settings/inventory`:

- medications and vaccines in `inventory_items`;
- disposable items in `inventory_items`;
- procedures in `services`;
- laboratory investigations in `services`;
- general and other services in `services`;
- packages in `packages`.

Historical consultations, completed bills, payments, claims, reconciliations, audit records, stock movements, and financial reports are read-only consumers of the retained rows and must not be modified by deletion.

## Authorization

Deletion is permitted only when the caller's exact application role is `admin` or `special_admin`. The `doctor_admin` role is explicitly excluded, as are operations, clinical, website, and other staff roles.

Authorization is enforced twice:

1. The React interface shows the Delete action only to `admin` and `special_admin`.
2. A database function verifies the authenticated caller's role before changing a catalogue row.

The interface check is usability only. The database check is the security boundary. Direct table updates must not provide a way for an unauthorized user to archive a catalogue entry.

## Data Model and Archive Operation

All three catalogue tables will have a nullable `archived_at timestamptz` marker. `inventory_items` already has this marker; the migration will add it to `services` and `packages` if absent.

The database exposes one catalogue archive RPC accepting a catalogue type and row identifier. Within one transaction, it will:

1. verify the exact caller role;
2. locate the requested row;
3. set `status = 'inactive'` and `archived_at = now()`;
4. leave the row, its identifier, its prices, and all referencing records intact;
5. report a clear error for an unknown type, missing row, unauthorized caller, or already archived row.

The RPC will not delete package components or panel price overrides. They remain attached for historical interpretation, while archived parents and components are excluded from future-use pickers.

## Read and Selection Behaviour

The settings page will omit archived entries from its normal lists after a successful deletion. All workflows that create new operational records must select only catalogue rows where `status = 'active'` and `archived_at IS NULL` when that column is available.

Historical screens may continue to resolve archived catalogue rows by identifier. Existing line-item snapshots such as description, quantity, unit price, cost, and totals remain authoritative and unchanged.

Existing inactive but unarchived entries are not treated as deleted. Their current visibility in administrative lists remains unchanged, while future-use pickers continue to exclude them through their active-status filter.

## User Interface

For permitted roles, each row receives a destructive-styled Delete control beside Edit. Selecting it opens a confirmation dialog containing the entry name and the following meaning:

- it will no longer be available for new bills or operational selections;
- existing patient and financial records will remain unchanged;
- the action does not physically erase historical data.

The control is disabled while the request is running. Success closes the confirmation dialog, refreshes relevant catalogue queries, and shows a success notification. Failure leaves the row visible and shows the database error without optimistic removal.

Unauthorized roles receive neither the control nor a usable database operation.

## Failure and Concurrency Handling

The database operation is idempotent from a data-integrity perspective: a repeated request cannot erase related records. The UI will treat an already archived response as a refresh condition rather than corrupting local state.

If an entry is being edited or selected concurrently, subsequent persistence must respect database constraints and active catalogue filtering. An already-created draft or historical line remains intact; the catalogue entry must not appear in a newly opened picker after query refresh.

## Testing

Tests will be written before production changes and will cover:

- exact-role authorization: `admin` and `special_admin` allowed;
- `doctor_admin` and all other roles denied;
- inventory items, services, and packages become inactive and archived;
- physical catalogue rows remain present;
- linked consultation items and other representative historical references remain present and unchanged;
- invalid catalogue types and missing identifiers fail safely;
- the settings page exposes Delete only to the permitted roles;
- confirmation copy explains historical preservation;
- successful archive invalidates inventory, service, package, safe-view, picker, and package-item queries as applicable;
- future-use pickers omit archived catalogue entries;
- the full frontend test suite, database tests, type checks, and production build pass.

## Deployment and Verification

The migration is additive and preserves all existing data. Deployment order is database migration first, then the frontend that calls the RPC. After deployment, a canary check will verify the page loads, permitted-role UI is available, unauthorized-role enforcement exists at the database boundary, and public/clinical application routes still build and load.

No existing catalogue entries will be archived automatically as part of deployment.

## Out of Scope

- permanent hard deletion;
- bulk deletion;
- automatic cleanup of historical references;
- changing or recalculating completed bills;
- restoring archived catalogue entries from this page;
- changing who may add or edit catalogue entries.
