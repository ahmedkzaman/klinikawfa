# Yezza historical import runbook

## Status and mandatory gate

This is an operator runbook for the Yezza patient merge and historical import.
It does **not** authorize a production import. Production apply is blocked until
the PostgreSQL integration suite (`supabase/tests/yezza_import_rpc.sql` and
`supabase/tests/yezza_import_reconciliation.sql`) has passed in an isolated,
non-production environment using the deployed schema and a representative,
approved fixture.

Never commit, upload, or place the supplied CSV files in a browser workflow.
Keep service-role credentials server-side. Do not invoke the approval RPCs from
an end-user client or run the apply endpoint with production credentials during
rehearsal.

## 1. Preflight, backup, and evidence

1. Confirm that the target is the designated isolated non-production project
   and record its project reference, schema migration version, operator, and
   start time in the cutover ticket.
2. Take a database backup using the approved platform procedure. Record the
   backup identifier, completion time, encryption/retention location, and a
   successful restore check before any import write. A backup that cannot be
   restored is not an approval to proceed.
3. Keep a read-only copy of the four source files outside the repository:
   `patients.csv`, `consultations.csv`, `transactions_1.csv`, and
   `transactions_2.csv`. Record only file names, row counts, and checksums in
   the ticket; do not attach source records.
4. Confirm the Yezza migrations and Edge Function are present, and run the
   rollback-only integration SQL suite in that isolated environment. Stop if
   any authorization, idempotency, or forced-rollback assertion fails.

## 2. Local dry-run and source reconciliation

Run the local dry-run with a directory containing only the supplied CSVs:

```text
npm run yezza:dry-run -- --input-dir <local-csv-directory> --output-dir <local-sanitized-report-directory>
```

This command may make read-only roster queries only when explicit local
credentials are configured; it never writes to the database. Retain the
sanitized artifacts locally and record their filenames and the `summary.json`
counts in the approval ticket:

- `patient_matches.csv`
- `patient_review.csv`
- `unresolved_doctors.csv`
- `orphan_financial_visits.csv`
- `summary.json`

Use the bounded, read-only financial reconciliation command as the source
baseline. It must return exactly the following values before any approval:

```text
npm run yezza:reconcile -- --transactions-one <transactions_1.csv> --transactions-two <transactions_2.csv>

inputRows: 69,832
duplicateRowsRemoved: 2,390
uniqueBills: 67,442
sourceTotal: RM5,684,929.22
paidTotal: RM1,099,076.00
matchesExpectedBaseline: true
```

Stop on any mismatch. Do not compensate by editing totals or silently dropping
rows. If the full dry-run needs a larger Node heap for the consultation export,
run it in the approved local import workstation with an explicitly recorded
memory limit; the bounded reconciliation remains the financial release gate.

## 3. Human review and approval

Before an apply request is allowed, an admin or doctor-admin must review and
record approval of all of the following:

1. Every `patient_review.csv` row. Name-only and name-plus-DOB candidates must
   not be auto-merged. Existing Klinik Awfa demographics remain canonical;
   Yezza differences are documented rather than overwritten.
2. Every repeated-IC case. The source assessment identifies five repeated IC
   values; resolve each as distinct source identities or an explicitly approved
   merge. Do not use one repeated IC to merge records automatically.
3. Every `unresolved_doctors.csv` row. Map only an exact normalized roster
   match; otherwise leave the historical consultation unassigned and retain
   the report reference.
4. The orphan-financial-visit policy. The 17,442 transaction-only visits are
   imported as `legacy-financial-only` queue entries with no fabricated
   consultation, note, or clinical item. They remain excluded from clinical
   activity metrics until staff complete them later.
5. The approved source counts, review counts, sanitized artifact names, and
   payload SHA-256 hash.

The server-side approval path is `POST /yezza-import?action=approve`. It
requires an authenticated admin or doctor-admin and sends the prepared payload
plus the exact dry-run hash as `expectedPayloadHash`. The Edge Function calls
the restricted `approve_yezza_import` RPC; direct client access to that RPC is
not permitted. Record the returned `importBatchId`, payload hash, approving
user, and approval time in the cutover ticket.

## 4. Apply and retry

1. Re-run the dry-run immediately before apply and compare its hash, counts,
   review counts, and artifact names to the approved evidence. Any difference
   invalidates approval.
2. Submit only the approved, bounded payload to
   `POST /yezza-import?action=apply` with its `importBatchId`. Apply batches in
   dependency order through the server pathway; never use browser-side inserts.
3. Stop automatically and investigate if a response reports `failed`, if the
   batch ledger is not `completed`, or if target counts/totals differ from the
   approved reconciliation rules.
4. A network timeout is not permission to submit a new source batch. Retry the
   **same** approved `importBatchId` and byte-identical payload. A completed
   retry must return `idempotent: true` and create no patient, visit, item,
   payment, or source-identity duplicate.

## 5. Rollback

The apply RPC rolls back its own failed batch transaction and records a safe
failure state in `import_batches`. If an operational rollback is needed after a
completed batch, stop all further applies, preserve the batch IDs and reports,
and restore the verified pre-import backup using the approved recovery
procedure. Do not delete patients, visits, or payments manually: that would
break source identity and financial traceability. After restore, verify the
backup's pre-import state before any new dry-run/approval cycle.

## 6. Post-import verification

Run the reconciliation SQL suite only against the isolated non-production
database after the complete import is present. In the same database session,
set the explicit non-production guard and run:

```sql
SET app.yezza_reconciliation_environment = 'isolated-non-production';
\i supabase/tests/yezza_import_reconciliation.sql
```

It verifies the full target baseline: 26,578 source patient identities,
67,442 visits and bills, 17,442 financial-only visits, unique bill keys,
RM5,684,929.22 billed, RM1,099,076.00 paid, one patient per imported visit,
financial-only clinical exclusion, and completed ledger ownership. The script
is read-only and finishes with `ROLLBACK`.

Also verify that imported patients, visits, and bills appear in the intended
Klinik Awfa history and billing views; confirm each positive paid source total
is represented by payments on the linked imported visit; and retain the SQL
output plus the source-reconciliation JSON in the cutover ticket. Only then may
the change request be considered for a separately authorized production
deployment and smoke test.
