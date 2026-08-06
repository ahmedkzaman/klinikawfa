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
