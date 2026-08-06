# Task 4 report — guarded Yezza batch import

## Outcome

Implemented a server-only Yezza import pathway with three authenticated actions:

- `POST /yezza-import?action=dry-run` validates and normalizes a prepared batch,
  deduplicates identical source bills, derives counts, returns only known
  sanitized review artifact names, and performs no database call or write.
- `POST /yezza-import?action=approve` recomputes the dry-run SHA-256 payload hash
  and requires it to equal the hash explicitly submitted by the reviewing admin.
  It then records the approved counts, review counts, artifact names, payload
  hash, approver, and approval time.
- `POST /yezza-import?action=apply` recomputes the normalized payload hash and
  submits the approved batch to one transactional PostgreSQL RPC.

No production import, production database connection, source CSV read, or apply
operation was performed in this task.

## Files delivered

- `supabase/functions/yezza-import/import-core.ts`
  - Runtime-independent request boundary and payload validation.
  - Stable canonical payload hashing.
  - Exact-source-bill deduplication with rejection of conflicting duplicates.
  - Derived source/review counts and sanitized artifact references.
  - Admin/doctor-admin defense-in-depth role check and safe HTTP errors.
- `supabase/functions/yezza-import/index.ts`
  - Edge Function wiring.
  - Uses the existing `requireRole(req, ["admin"])` helper, which validates the
    bearer JWT with Auth and reads the role from `public.user_roles`; it does not
    use editable user metadata.
  - Keeps `SUPABASE_SERVICE_ROLE_KEY` inside the Edge Function environment and
    uses it only to call the two restricted RPCs.
- `supabase/config.toml`
  - Explicitly keeps JWT verification enabled for `yezza-import`.
- `supabase/migrations/20260806135121_add_guarded_yezza_import_rpc.sql`
  - Adds approval evidence to `import_batches`.
  - Adds `legacy_import` consultation provenance.
  - Revokes direct authenticated mutations of the import ledger and external
    identity tables so clients cannot bypass the approval pathway.
  - Adds service-role-only `approve_yezza_import` and `apply_yezza_import` RPCs.
  - Preserves source prices and prevents historical consultation items from
    reserving or deducting present-day inventory.
- `src/test/yezza-import-idempotency.test.ts`
  - Focused request/contract coverage for authorization, dry-run behavior,
    approval gating, retries, patient identity reuse, transaction deduplication,
    and rollback.

## Security and authorization

The Edge Function first calls the shared secure role helper and accepts only the
`admin` and `doctor_admin` database roles represented by the helper's `admin`
label. The handler independently checks the returned concrete role. Both
database RPCs then independently query `public.user_roles` for the actor ID
derived from the verified Auth user. No authorization decision reads
`raw_user_meta_data`, `user_metadata`, or request-supplied role claims.

Both RPCs are `SECURITY DEFINER` because they must execute the atomic import
across RLS-protected clinical tables. Their `search_path` is fixed, execution is
revoked from `PUBLIC`, `anon`, and `authenticated`, and execution is granted only
to `service_role`. The service credential is referenced only via the server-side
`Deno.env` environment and is absent from frontend code.

Approval binds all of the following to one immutable `(source_system,
source_batch_id)` ledger identity:

- normalized payload SHA-256 hash;
- source row counts;
- review counts;
- sanitized review artifact names;
- approving admin and timestamp.

Apply locks the batch row and rejects a missing, changed, failed, or otherwise
unapproved batch. It independently re-derives database-side counts from the JSON
payload and compares them with the approved counts before writing.

## Transaction and idempotency behavior

The apply RPC executes dependency-ordered writes inside one PL/pgSQL exception
subtransaction:

1. approved `import_batches` ledger row is locked and marked applying;
2. patients are created or existing patients are reused, then
   `patient_external_ids` are created;
3. `queue_entries` and `visit_external_ids` are created;
4. `consultations` with `entry_source = 'legacy_import'` are created;
5. `consultation_items` are created without inventory allocation;
6. positive paid amounts create one `payments` row;
7. every accepted bill creates its `transaction_external_ids` row.

Source patients, visits, and bills use transaction-scoped advisory locks plus
the existing unique external-source keys. Existing patient mappings always win.
An existing visit suppresses re-creation of its queue, consultation, and items.
An existing bill must match the same visit and amounts or the batch fails. A
second apply of a completed batch returns the persisted counts with
`idempotent: true` without executing writes.

If any write or trigger fails, PostgreSQL rolls back all work inside the apply
subtransaction. The surrounding function then records only a non-PHI error code
and SQLSTATE on the existing batch ledger, marks it failed, and returns a safe
failure result. It does not persist a partial patient, visit, item, payment, or
external identity set.

## Validation and limits

- Request bodies are capped at 8 MiB both by declared length and bytes read.
- Each patients/visits/items/transactions array is capped at 2,000 rows, keeping
  the endpoint a batch worker rather than a one-request whole-history import.
- Source IDs, UUIDs, dates, timestamps, money precision, item quantity, visit
  type, payment type, and payment method are validated before RPC invocation.
- A visit must reference a patient in the same approved payload.
- Financial-only visits cannot contain a consultation or clinical items.
- Conflicting duplicate source bills are rejected; byte-equivalent normalized
  duplicates are collapsed before hashing, approval, and apply.
- Review references are generated from a fixed allow-list of report basenames;
  caller-supplied paths are never returned or stored.

## Verification evidence

The TDD red phase was observed first: the focused suite failed because
`supabase/functions/yezza-import/import-core.ts` did not exist.

Fresh focused verification after implementation:

```text
npm.cmd test -- src/test/yezza-import-idempotency.test.ts
1 test file passed; 8 tests passed.
```

Focused TypeScript verification:

```text
npx.cmd tsc --noEmit --target ES2021 --module ESNext --moduleResolution Bundler \
  --lib ES2021,DOM --skipLibCheck --types vitest/globals \
  supabase/functions/yezza-import/import-core.ts \
  src/test/yezza-import-idempotency.test.ts
exit 0
```

Edge Function verification using Deno 2.5.6:

```text
npx.cmd --yes deno@2.5.6 check supabase/functions/yezza-import/index.ts
exit 0
```

The migration was parsed successfully with PostgreSQL's `pglast` parser:

```text
PostgreSQL parse: pass
```

Repository whitespace validation:

```text
git diff --check
exit 0
```

## Remaining concern / required pre-deployment check

The workstation has neither Docker nor a running local Supabase stack, so the
migration, rollback path, RLS grants, and database-side integration assertions
could not be executed against PostgreSQL, and Supabase database advisors could
not be run. Before deployment, Task 5 must apply this migration to an isolated
non-production Supabase environment, run a small approved fixture through
dry-run/approve/apply/retry/failure paths, verify table counts after forced
rollback, and run Supabase security/performance advisors. Production apply must
remain disabled until that database verification and human review are complete.
