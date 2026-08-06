# Task 1 report — Yezza source identity and import audit tables

## Delivered

- Added `supabase/migrations/20260806103000_add_yezza_source_identity.sql`.
- Added rollback-only integration coverage in `supabase/tests/yezza_source_identity.sql`.

The migration creates the required `patient_external_ids`,
`visit_external_ids`, `transaction_external_ids`, and `import_batches`
tables. Each source identity key is the table primary key, making repeated
imports idempotent when they upsert by source key. Each identity row has a
required `import_batch_id` foreign key so every imported mapping is
attributable to its batch. The migration adds indexes for foreign-key and
batch/status lookup paths.

All four tables have RLS enabled. Only authenticated users whose
`user_roles.role` is `admin` or `doctor_admin` through the existing
`can_manage_clinic_permissions` helper may read or write them. Anonymous
table privileges are explicitly revoked.

## SQL integration coverage

`supabase/tests/yezza_source_identity.sql` uses fixed `TEST ONLY` UUIDs,
creates synthetic user/patient/queue data, and ends in `ROLLBACK`. It asserts:

- RLS is enabled on all four tables.
- An administrator can create a batch and all three identity mappings.
- Duplicate source keys are rejected for patient, visit, and transaction IDs.
- Patient, queue-entry, and import-batch foreign keys reject missing rows.
- A non-operator staff user cannot write import batches.
- Anonymous reads and writes are denied (either by table privilege or RLS).

## Verification

| Check | Result |
| --- | --- |
| `git diff --check` | Passed |
| `npm run lint:changed` | Could not run: its baseline comparison attempted to fetch `origin/main`, which currently has no merge base with `HEAD` after a forced remote update. |
| `npm test` | Did not complete within the 60-second execution safety window; terminated without a test result. |
| `supabase db lint` | Could not run: local PostgreSQL at `127.0.0.1:54322` refused the connection. The machine also has no usable Docker engine. |
| `supabase/tests/yezza_source_identity.sql` | Not executed for the same unavailable local database reason. |

No production Supabase project was connected to, and no production data was
read or modified.

## Follow-up

Start the local Supabase stack (or run the rollback-only SQL script in a
non-production Supabase environment after applying migrations) to complete the
database integration and advisor checks.

## Review fix report

The migration and SQL integration test were tightened after review:

- Replaced the reused permission helper with `can_manage_imports`, a dedicated
  security-definer helper that allows only `admin` and `doctor_admin`. This
  avoids the later expansion of `can_manage_clinic_permissions` to
  `special_admin`.
- Added non-empty `source_batch_id` and a unique `(source_system,
  source_batch_id)` key to `import_batches` for idempotent batch retries.
- Made source mapping tables insert-only for authenticated users; no mapping
  update or delete privilege/policy exists. Batch source identity and creator
  are immutable through a trigger, and audit batches cannot be deleted.
- Required `created_by = auth.uid()` in the batch insert/update policy's
  `WITH CHECK` condition.
- Added a trigger that rejects a mapping when its `source_system` differs from
  the referenced import batch.
- Expanded the SQL test to cover denied `staff` and `special_admin` reads and
  writes for every table, anonymous denial for every table, forged creators,
  cross-source links, all required foreign-key paths, batch deduplication, and
  immutable identity mappings.

Follow-up verification: `git diff --check` passed. `npm run lint` remains
blocked by 293 pre-existing lint errors in unrelated application and stress-test
files. `supabase db lint` and the rollback SQL integration test remain blocked
because local PostgreSQL on `127.0.0.1:54322` is unavailable; no production
database was accessed.

## Review fix report — forward migration correction

- Restored `20260806103000_add_yezza_source_identity.sql` exactly to its
  original committed contents.
- Added `20260806110000_harden_yezza_source_identity.sql` as the forward-only
  hardening migration for databases that already applied the foundation.
- The new migration adds the source-batch deduplication key without rewriting
  legacy batch rows. Its insert policy requires a non-null source batch ID for
  every new import, so all future batches are deduplicated.
- Added rollback-only assertions for the `import_batches.created_by ->
  auth.users(id)` FK and `patient_external_ids.import_batch_id ->
  import_batches(id)` FK; existing visit and transaction batch-FK assertions
  remain in place.

Verification for this correction: `git diff --check` passed. The local
PostgreSQL/Supabase stack remains unavailable, so the SQL integration script
and database advisors were not executed. No production database was accessed
or modified.
