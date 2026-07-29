# Completed Bill Corrections — Staging Verification

## Scope and safety

- Verified on staging project `nhjbqdiyptjqherdfbqk` on 2026-07-29.
- Production project `vmareunjvlndevmgqbte` was not queried or changed.
- Before applying DDL, staging had 203 migrations, latest version
  `20260728144223`, and PostgreSQL 17.6.
- Schema prerequisites were checked through catalog metadata only. No existing
  patient names, identity numbers, phone numbers, or clinical notes were read.
- All data-path checks used fixed synthetic UUIDs under
  `70000000-0000-4000-8000-*` and names prefixed `TEST ONLY`.
- The fixture ran inside a PL/pgSQL exception subtransaction that deliberately
  rolled back after producing its report. A separate cleanup query confirmed
  zero matching rows in auth users, patients, queues, consultations, items,
  payments, claims, inventory, panels, charge types, and correction audits.

## Applied migrations

The exact SQL from these local migrations was applied in order:

1. `20260728150000_add_completed_bill_corrections.sql`
2. `20260728153000_reconcile_completed_bill_financial_reporting.sql`
3. `20260729003007_index_completed_bill_correction_foreign_keys.sql`

The Supabase migration service initially assigned application-time versions.
Without rerunning any DDL, the staging-only history repair in
`supabase/tests/completed_bill_correction_staging_history_repair.sql` mapped
those rows to the committed filename versions inside one transaction. It
checked all three source `(version, name)` pairs, required all target versions
to be absent, rejected duplicate feature names, asserted exactly three updated
rows, and verified all three postconditions before commit.

Final staging history exactly matches the repository:

1. `20260728150000` — `add_completed_bill_corrections`
2. `20260728153000` — `reconcile_completed_bill_financial_reporting`
3. `20260729003007` — `index_completed_bill_correction_foreign_keys`

Post-repair evidence: 206 total migrations, zero duplicate versions, zero
duplicate completed-bill-correction names, latest version `20260729003007`.

## Synthetic fixture IDs

| Entity | Synthetic ID |
|---|---|
| Actor | `70000000-0000-4000-8000-000000000001` |
| Cash patient | `70000000-0000-4000-8000-000000000101` |
| Panel patient | `70000000-0000-4000-8000-000000000102` |
| Checkout patient | `70000000-0000-4000-8000-000000000103` |
| Cash queue | `70000000-0000-4000-8000-000000000201` |
| Panel queue | `70000000-0000-4000-8000-000000000202` |
| Checkout queue | `70000000-0000-4000-8000-000000000203` |
| Cash consultation | `70000000-0000-4000-8000-000000000301` |
| Panel consultation | `70000000-0000-4000-8000-000000000302` |
| Checkout consultation | `70000000-0000-4000-8000-000000000303` |
| Inventory item | `70000000-0000-4000-8000-000000000401` |
| Cash bill items | `70000000-0000-4000-8000-000000000501`–`503` |
| Panel bill item | `70000000-0000-4000-8000-000000000504` |
| Cash payment | `70000000-0000-4000-8000-000000000601` |
| Panel payment | `70000000-0000-4000-8000-000000000602` |
| Charge type | `70000000-0000-4000-8000-000000000701` |
| Panel | `70000000-0000-4000-8000-000000000801` |
| Panel claim | `70000000-0000-4000-8000-000000000901` |

The role matrix uses synthetic actors
`70000000-0000-4000-8000-000000000001`–`006` and
`70000000-0000-4000-8000-000000000011`–`016`.

## Reproducible authenticated harness

The exact tracked harness is
`supabase/tests/completed_bill_corrections.sql`. It:

- begins an explicit transaction;
- creates only fixed `TEST ONLY` auth accounts, roles, and clinical/financial
  fixtures;
- executes the public RPCs after `SET LOCAL ROLE authenticated`;
- sets `request.jwt.claim.role = authenticated` and changes the synthetic
  `request.jwt.claim.sub` for every matrix actor;
- contains assertions for every result listed below;
- contains no `COMMIT`; and
- executes `RESET ROLE; ROLLBACK;` before returning its result.

Sanitized staging result:

```json
{
  "status": "pass",
  "database_role": "authenticated",
  "jwt_claims": "synthetic",
  "allowed_roles": [
    "ops_staff",
    "operations",
    "staff",
    "admin",
    "special_admin",
    "doctor_admin"
  ],
  "denied_roles": [
    "locum",
    "resident_doctor",
    "purchaser",
    "staff_nurse",
    "website_editor",
    "guest"
  ],
  "medicine_inventory": "pass",
  "atomic_rollback": "pass",
  "stale_fingerprint": "pass",
  "cash_panel_reconciliation": "pass",
  "audit_history": "pass",
  "atomic_checkout": "pass",
  "transaction_end": "ROLLBACK"
}
```

## Functional evidence

### Role matrix

Context and correction succeeded for:

- `ops_staff`
- `operations`
- `staff`
- `admin`
- `special_admin`
- `doctor_admin`

Both RPCs returned SQLSTATE `42501` with `NOT_AUTHORIZED`, with no new audit
row, for:

- `locum`
- `resident_doctor`
- `purchaser`
- `staff_nurse`
- `website_editor`
- `guest`

### Medicine and inventory boundaries

- Quantity below `dispensed_qty` was rejected with
  `QUANTITY_BELOW_DISPENSED`.
- Removing a dispensed medicine was rejected with
  `DISPENSED_MEDICINE_REMOVE`.
- A price-only correction succeeded.
- Inventory stock remained `50 → 50`.
- Allocated quantity remained `0 → 0`.
- Synthetic inventory transaction count remained `0 → 0`.
- Queue and consultation both remained `completed`.

### Atomicity and concurrency

- A payload containing a valid item price edit and an unrelated payment UUID
  was rejected with `PAYMENT_NOT_IN_VISIT`.
- Item state, payment state, panel claim state, and audit count were identical
  before and after that failed call.
- Two contexts returned the same fingerprint. Writer A succeeded; writer B
  using the stale fingerprint was rejected with SQLSTATE `40001` and
  `STALE_BILL`. Writer A's price remained authoritative.
- `dblink` and `pg_background` were not installed, so an external two-session
  harness was not available. The staging test exercised the two-reader stale
  fingerprint contract, while migration tests and catalog checks verified the
  shared transaction advisory lock and deterministic row-lock order used by
  concurrent sessions.

### Cash reconciliation

- Direct payment amount and method updates succeeded.
- Corrected subtotal: RM59.00.
- Discount: RM4.00.
- Tax: RM5.50.
- Corrected total: RM60.50.
- With RM40.00 paid, outstanding was RM20.50.
- With RM70.00 paid, credit due was RM9.50.
- Audit before/after totals and paid values matched the hand-calculated values.

### Panel reconciliation

- Corrected claim amount: RM80.00.
- Claim status remained `received`.
- Received amount remained RM120.00.
- Approved amount remained RM100.00.
- Panel credit due was RM40.00.

### History and checkout

- The authorized history projection returned bounded financial summaries.
- Active checkout inserted exactly one payment and completed the queue and
  consultation in one call.
- A duplicate checkout was rejected with `ALREADY_COMPLETED` and did not add a
  second payment.

## Security and advisor evidence

- Audit and guard tables have RLS enabled.
- The audit table has an authorized read policy; neither table grants raw
  mutation privileges to `PUBLIC`, `anon`, or `authenticated`.
- The guard table intentionally has no client policy and no client privileges;
  the security advisor reports this as informational `RLS Enabled No Policy`.
- All feature functions have a fixed `public, pg_temp` search path.
- `PUBLIC` and `anon` cannot execute any feature RPC.
- Only the intended public entry points are executable by `authenticated`;
  internal state, trigger, normalization, and locking functions are not.
- The audit immutability trigger is enabled.
- Existing consultation item table privileges remain necessary for
  non-completed bills, but the only update policy requires adjustment metadata
  to remain null and the visit to be non-completed. Completed adjustments are
  therefore writable only through the guarded correction RPC.
- Required audit indexes cover `(queue_entry_id, created_at DESC)` and
  `(consultation_id, created_at DESC)`.
- The performance advisor initially identified three feature-owned uncovered
  foreign keys. Migration `20260729003007` added indexes for audit actor, guard
  actor, and guard consultation. A second advisor run no longer reported any
  completed-bill-correction foreign key finding.
- Remaining security and performance advisor findings concern pre-existing
  objects outside this feature and were not changed.

Advisor references:

- [RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)

## Cleanup result

Post-test counts for every synthetic fixture category were `0`: auth users,
user roles, patients, queues, consultations, items, payments, claims, inventory,
panels, charge types, and correction audits. No synthetic patient, auth
account, financial row, inventory row, or clinical row remains in staging.
