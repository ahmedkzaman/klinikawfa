# Lovable Cloud to Supabase Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote Supabase project `nhjbqdiyptjqherdfbqk` to the Klinik Awfa production backend while preserving the current production records, enforcing the approved security model, migrating every retrievable Storage object, and retaining a tested rollback path.

**Architecture:** Treat the 21 July Lovable Cloud PostgreSQL archive as the immutable data source and the existing target schema as authoritative. Rehearse every database transform outside production, apply only the reconciled data and missing migrations to the target, copy Storage bytes separately, deploy and verify Edge Functions, then switch the public frontend through protected GitHub values only after every hard gate passes.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.109.1, Supabase Database/Auth/Storage/Edge Functions, Node.js 24, TypeScript, Vitest, Deno 1.46.3, Vite 8, GitHub Actions, GitHub Pages.

## Global Constraints

- Approved source archive: `C:\Users\ahmed\Downloads\klinikawfa_260721.backup` only.
- Approved archive SHA-256: `16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863`.
- Live source project reference: `ncysmppzfjtiekfnomdv`; do not change or delete it.
- New production project reference: `nhjbqdiyptjqherdfbqk`; verify this exact value before every write-capable phase.
- Preserve target-managed schemas, target migration history, target project configuration, and newer target security hardening.
- Import 11 Auth users and 11 identities, but never import sessions, refresh tokens, one-time tokens, audit logs, or instance configuration.
- Never place a database URL, database password, service-role key, private export, patient data, or secret value in Git, console output, a report, or chat.
- Do not expose private Storage objects to migrate them.
- Do not change user-facing wording or clinical content.
- Do not change DNS or the custom domain.
- Do not switch the frontend while any private Storage object is missing or unverifiable.
- Do not proceed past a failing archive fingerprint, target backup, schema reconciliation, Auth reconciliation, RLS matrix, advisor, Edge Function secret, CI, build, dependency audit, or production smoke gate.
- `website_editor` must remain excluded from clinic operations, finance, patient records, workforce administration, and privileged system settings.
- Website Editor configuration access remains limited to `admin`, `special_admin`, `doctor_admin`, and `website_editor`.
- All operational artifacts that contain database metadata, object names, hashes, or private information go under `C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722`, never under the repository.

---

## File Map

- `scripts/cutover/cutover-contract.mjs`: immutable source/target identifiers, archive fingerprint verification, and secret-safe guard output.
- `scripts/cutover/archive-inventory.mjs`: parses `pg_restore --list` output into schema/table inventory without printing row contents.
- `src/test/production-cutover-contract.test.ts`: locks the approved archive fingerprint, project references, and no-secret logging contract.
- `supabase/migrations/20260721162256_restore_staff_messages.sql`: restores the one source-only application table with hardened staff-only RLS and explicit Data API grants.
- `src/test/staff-messages-migration.test.ts`: statically verifies the migration's table, RLS, grants, policies, and realtime contract.
- `scripts/cutover/database-reconcile.ps1`: guarded archive/target backup, scratch restore, selective data import, Auth import, integrity checks, and rollback commands.
- `scripts/cutover/storage-migrate.mjs`: manifest-driven Storage copy and byte/digest verification using credentials loaded only from protected environment files.
- `scripts/cutover/edge-function-contract.mjs`: inventories function directories, required secret names, and expected JWT configuration without reading secret values.
- `src/test/production-backend-reference.test.ts`: prevents the old project reference from remaining in active runtime/config files after cutover.
- `supabase/config.toml`, `public/_headers`, `src/config/supabase-build-config.ts`, `src/pages/tv/QueueTV.tsx`: bind runtime-safe public configuration and asset URLs to the promoted project.
- `stress-tests/.env.staging.example`, `stress-tests/README.md`, `stress-tests/scripts/guard-not-prod.sh`, `stress-tests/scripts/v7/guard-not-prod.sh`, `stress-tests/phase-d/seed-rls-matrix.sql`, `stress-tests/phase-d/cleanup-rls-matrix.sql`, `stress-tests/phase-d/bootstrap-rls-staging.sql`: mark `nhjbqdiyptjqherdfbqk` as production and prevent destructive fixtures against it.

---

### Task 1: Cutover Contract and Archive Inventory

**Files:**
- Create: `scripts/cutover/cutover-contract.mjs`
- Create: `scripts/cutover/archive-inventory.mjs`
- Create: `src/test/production-cutover-contract.test.ts`

**Interfaces:**
- Consumes: archive path supplied by `KLINIK_AWFA_SOURCE_ARCHIVE`; protected environment value `SUPABASE_PROJECT_REF`.
- Produces: `assertApprovedArchive(path): Promise<{ path: string; size: number; sha256: string }>` and `assertTargetProjectRef(ref): string`; JSON inventory with `schemas`, `tables`, and `archiveSha256`.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  APPROVED_ARCHIVE_SHA256,
  LIVE_SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertTargetProjectRef,
  redactConnectionString,
} from "../../scripts/cutover/cutover-contract.mjs";

describe("production cutover contract", () => {
  it("locks the approved source and target", () => {
    expect(APPROVED_ARCHIVE_SHA256).toBe(
      "16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863",
    );
    expect(LIVE_SOURCE_PROJECT_REF).toBe("ncysmppzfjtiekfnomdv");
    expect(TARGET_PROJECT_REF).toBe("nhjbqdiyptjqherdfbqk");
  });

  it("rejects every write target except the promoted project", () => {
    expect(assertTargetProjectRef(TARGET_PROJECT_REF)).toBe(TARGET_PROJECT_REF);
    expect(() => assertTargetProjectRef(LIVE_SOURCE_PROJECT_REF)).toThrow(
      /Refusing write-capable cutover operation/,
    );
  });

  it("redacts passwords and query credentials", () => {
    const input = "postgresql://postgres:secret@example.test:5432/postgres?password=secret";
    const output = redactConnectionString(input);
    expect(output).not.toContain("secret");
    expect(output).toContain("postgresql://postgres:***@example.test:5432/postgres");
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

Run: `npm test -- src/test/production-cutover-contract.test.ts`

Expected: FAIL because `scripts/cutover/cutover-contract.mjs` does not exist.

- [ ] **Step 3: Implement the immutable contract and redaction helper**

```js
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const LIVE_SOURCE_PROJECT_REF = "ncysmppzfjtiekfnomdv";
export const TARGET_PROJECT_REF = "nhjbqdiyptjqherdfbqk";
export const APPROVED_ARCHIVE_SHA256 =
  "16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863";
export const APPROVED_ARCHIVE_SIZE = 1_688_357;

export const assertTargetProjectRef = (value) => {
  if (value !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing write-capable cutover operation for project ref ${value || "<missing>"}`);
  }
  return value;
};

export const redactConnectionString = (value) => {
  const url = new URL(value);
  if (url.password) url.password = "***";
  if (url.searchParams.has("password")) url.searchParams.set("password", "***");
  return url.toString();
};

export const assertApprovedArchive = async (path) => {
  const metadata = await stat(path);
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const sha256 = hash.digest("hex").toUpperCase();
  if (metadata.size !== APPROVED_ARCHIVE_SIZE || sha256 !== APPROVED_ARCHIVE_SHA256) {
    throw new Error(`Approved archive fingerprint mismatch: size=${metadata.size} sha256=${sha256}`);
  }
  return { path, size: metadata.size, sha256 };
};
```

- [ ] **Step 4: Implement archive inventory without record output**

`archive-inventory.mjs` must run the configured `pg_restore --list`, accept only the approved archive, parse `TABLE` and `TABLE DATA` entries, and write JSON only to the protected cutover directory. Its terminal output is limited to archive SHA, table count, and schema names.

Run: `node scripts/cutover/archive-inventory.mjs --archive "C:\Users\ahmed\Downloads\klinikawfa_260721.backup" --output "C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722\source-inventory.json"`

Expected: `archive verified; schemas=<count>; tables=94` and no row contents.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/test/production-cutover-contract.test.ts`

Expected: PASS.

```powershell
git add scripts/cutover/cutover-contract.mjs scripts/cutover/archive-inventory.mjs src/test/production-cutover-contract.test.ts
git commit -m "test: lock production cutover contract"
```

---

### Task 2: Restore `staff_messages` with Least-Privilege RLS

**Files:**
- Modify: `supabase/migrations/20260721162256_restore_staff_messages.sql`
- Create: `src/test/staff-messages-migration.test.ts`

**Interfaces:**
- Consumes: existing `public.is_staff_or_clinical(uuid)` authorization helper and Supabase Realtime publication.
- Produces: `public.staff_messages` with staff-only `SELECT` and sender-bound `INSERT`; `anon` has no privileges; `authenticated` has only `SELECT, INSERT`.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721162256_restore_staff_messages.sql",
  "utf8",
).toLowerCase();

describe("staff_messages migration", () => {
  it("creates and protects the table", () => {
    expect(sql).toContain("create table public.staff_messages");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.staff_messages from anon");
    expect(sql).toContain("grant select, insert on table public.staff_messages to authenticated");
  });

  it("requires clinical staff and sender ownership", () => {
    expect(sql).toContain("public.is_staff_or_clinical((select auth.uid()))");
    expect(sql).toContain("(select auth.uid()) = sender_id");
    expect(sql).not.toContain("website_editor");
  });

  it("adds realtime idempotently", () => {
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("alter publication supabase_realtime add table public.staff_messages");
  });
});
```

- [ ] **Step 2: Run the test and observe failure against the empty migration**

Run: `npm test -- src/test/staff-messages-migration.test.ts`

Expected: FAIL because the migration has no table or policy SQL.

- [ ] **Step 3: Implement the migration**

```sql
create table public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  receiver_id uuid references auth.users(id) on delete cascade
);

alter table public.staff_messages enable row level security;
revoke all on table public.staff_messages from public, anon, authenticated;
grant select, insert on table public.staff_messages to authenticated;
grant all on table public.staff_messages to service_role;

create policy staff_messages_staff_read
on public.staff_messages for select to authenticated
using (
  public.is_staff_or_clinical((select auth.uid()))
  and (
    receiver_id is null
    or sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
  )
);

create policy staff_messages_staff_send
on public.staff_messages for insert to authenticated
with check (
  public.is_staff_or_clinical((select auth.uid()))
  and sender_id = (select auth.uid())
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_messages'
  ) then
    alter publication supabase_realtime add table public.staff_messages;
  end if;
end
$$;
```

- [ ] **Step 4: Run the focused test and migration parser checks**

Run: `npm test -- src/test/staff-messages-migration.test.ts`

Expected: PASS.

Run the migration against the disposable rehearsal database, then query `pg_policies`, `information_schema.role_table_grants`, and `pg_publication_tables`.

Expected: two policies, no `anon` grants, `authenticated` has only `SELECT/INSERT`, and one realtime publication entry.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260721162256_restore_staff_messages.sql src/test/staff-messages-migration.test.ts
git commit -m "feat: restore staff messages securely"
```

---

### Task 3: Protected Backup and Scratch Rehearsal

**Files:**
- Create: `scripts/cutover/database-reconcile.ps1`
- Create outside Git: `C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722\target-before-cutover.backup`
- Create outside Git: `C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722\rehearsal-report.json`

**Interfaces:**
- Consumes: protected `staging.env`, approved archive, PostgreSQL 17 tools, exact target ref.
- Produces: verified target backup plus a machine-readable reconciliation report with table counts, schema differences, constraint results, sequence checks, migration identities, and Auth counts.

- [ ] **Step 1: Implement a guard-first PowerShell interface**

The script accepts only `-Phase Inventory|Backup|Rehearse|Import|Verify|Rollback`. It loads the protected environment file without echoing values, calls `assertTargetProjectRef`, refuses any DB host whose project ref is not `nhjbqdiyptjqherdfbqk`, and writes detailed logs only to the protected cutover directory.

```powershell
param(
  [Parameter(Mandatory)]
  [ValidateSet('Inventory','Backup','Rehearse','Import','Verify','Rollback')]
  [string]$Phase,
  [string]$ProtectedEnv = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\staging.env',
  [string]$ArtifactRoot = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722'
)
$ErrorActionPreference = 'Stop'
$ExpectedRef = 'nhjbqdiyptjqherdfbqk'
```

- [ ] **Step 2: Verify the source fingerprint and inventory the target read-only**

Run: `powershell -File scripts/cutover/database-reconcile.ps1 -Phase Inventory`

Expected summary: source SHA matches; target ref matches; source public tables `94`; target public tables `93`; target Auth users `0`; target migration rows `153`. No record values are printed.

- [ ] **Step 3: Create and hash the full target backup before any target write**

Run: `powershell -File scripts/cutover/database-reconcile.ps1 -Phase Backup`

Expected: `target-before-cutover.backup` exists outside Git, `pg_restore --list` succeeds, and `target-before-cutover.sha256` records a non-empty SHA-256 digest. A failed dump or list check exits non-zero and blocks every later phase.

- [ ] **Step 4: Rehearse in a disposable PostgreSQL 17 database**

The rehearsal restores the approved source archive into a disposable local database, restores the target schema into a second disposable database, produces explicit column/type/default/constraint/policy/function diffs, and runs the same selective data loader intended for production. It must not connect to the target with write privileges.

Run: `powershell -File scripts/cutover/database-reconcile.ps1 -Phase Rehearse`

Expected: `rehearsal-report.json` records 94 source public tables, only `public.staff_messages` as source-only, 11 Auth users, 11 Auth identities, zero imported sessions and refresh tokens, and no unexplained target-column incompatibility.

- [ ] **Step 5: Verify the rehearsal report and commit only the script**

Run: `node -e "const r=require(process.argv[1]); if(!r.pass||r.auth.sessions!==0||r.auth.refreshTokens!==0) process.exit(1)" "C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722\rehearsal-report.json"`

Expected: exit 0.

```powershell
git add scripts/cutover/database-reconcile.ps1
git commit -m "chore: add guarded database cutover runner"
```

---

### Task 3A: Preserve Populated Source Fields and Complete the Rehearsal

**Files:**
- Modify: `supabase/migrations/20260721174422_preserve_source_cutover_fields.sql`
- Create: `src/test/cutover-compatibility-migration.test.ts`
- Modify: `scripts/cutover/database-reconcile.ps1`

**Interfaces:**
- Consumes: the fail-closed Task 3 report identifying two incompatible tables, eight populated source-only columns, four lossless appointment renames, and the rehearsal-discovered source enum member `public.clinic_status = 'cancelled'` that is absent from target.
- Produces: additive target compatibility columns, constraints, and enum member plus a loader transform that maps the renamed appointment fields; a new protected rehearsal report with `pass=true`.

- [ ] **Step 1: Write the failing compatibility contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721174422_preserve_source_cutover_fields.sql",
  "utf8",
).toLowerCase();

describe("source cutover compatibility migration", () => {
  it.each([
    "patient_ic text",
    "service_slug text",
    "payment_reference text",
    "updated_at timestamp with time zone default now()",
  ])("preserves appointments field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it.each([
    "cancelled_at timestamp with time zone",
    "cancelled_by uuid",
    "cancellation_reason text",
    "queue_sequence integer",
  ])("preserves queue field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it("restores both source foreign keys", () => {
    expect(sql).toContain("foreign key (service_slug) references public.clinic_services(slug)");
    expect(sql).toContain("foreign key (cancelled_by) references auth.users(id)");
  });

  it("preserves the source queue cancellation status", () => {
    expect(sql).toContain("alter type public.clinic_status add value if not exists 'cancelled'");
  });

  it("does not replace the authoritative target appointment columns or default", () => {
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toContain("alter column status set default");
    expect(sql).not.toContain("patient_name text");
    expect(sql).not.toContain("patient_phone text");
  });
});
```

- [ ] **Step 2: Run the focused test and observe failure against the empty CLI scaffold**

Run: `npm test -- src/test/cutover-compatibility-migration.test.ts`

Expected: FAIL because none of the columns or constraints exist in the empty migration.

- [ ] **Step 3: Implement the additive compatibility migration**

```sql
alter type public.clinic_status add value if not exists 'cancelled';

alter table public.appointments
  add column if not exists patient_ic text,
  add column if not exists service_slug text,
  add column if not exists payment_reference text,
  add column if not exists updated_at timestamp with time zone default now();

alter table public.queue_entries
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text,
  add column if not exists queue_sequence integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_service_slug_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_service_slug_fkey
      foreign key (service_slug) references public.clinic_services(slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.queue_entries'::regclass
      and conname = 'queue_entries_cancelled_by_fkey'
  ) then
    alter table public.queue_entries
      add constraint queue_entries_cancelled_by_fkey
      foreign key (cancelled_by) references auth.users(id);
  end if;
end
$$;
```

- [ ] **Step 4: Add the explicit lossless appointment rename map to the loader**

The generated `INSERT ... SELECT` for `public.appointments` must map source `patient_name` to target `name`, `patient_phone` to `phone`, `appointment_date` to `preferred_date`, and `appointment_time` to `preferred_time`. It must copy the eight newly represented fields by identical name. All other tables continue through the intersection-based mapping. The target `status` default remains `'pending'`, but every imported source row copies its explicit source status value. Queue rows retain the source `clinic_status = 'cancelled'` value through the additive enum member; do not remap it.

- [ ] **Step 5: Apply the migration only to target scratch and rerun the full rehearsal**

Run: `npm test -- src/test/cutover-compatibility-migration.test.ts src/test/staff-messages-migration.test.ts`

Expected: PASS.

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cutover/database-reconcile.ps1 -Phase Rehearse`

Expected: protected report `pass=true`; public row-count mismatches `0`; Auth users `11`; identities `11`; sessions `0`; refresh tokens `0`; unvalidated constraints `0`; sequence failures `0`; target write connections `0`.

- [ ] **Step 6: Run the pre-write verification gate and commit**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cutover/database-reconcile.ps1 -Phase Verify`

Expected: exit 0 while performing read-only checks only.

```powershell
git add supabase/migrations/20260721174422_preserve_source_cutover_fields.sql src/test/cutover-compatibility-migration.test.ts scripts/cutover/database-reconcile.ps1
git commit -m "feat: preserve source cutover fields"
```

---

### Task 4: Import Application Data and Portable Auth Records

**Files:**
- Modify outside Git: protected cutover manifests and SQL generated by `scripts/cutover/database-reconcile.ps1`
- Apply: the six approved CMS migrations, `supabase/migrations/20260721162256_restore_staff_messages.sql`, and `supabase/migrations/20260721174422_preserve_source_cutover_fields.sql`

**Interfaces:**
- Consumes: passing rehearsal report and verified pre-cutover target backup.
- Produces: target application data, 11 Auth users, 11 provider identities, zero source sessions/refresh tokens, recorded target migrations, and a passing integrity report.

- [ ] **Step 1: Reconfirm all hard preconditions immediately before the write window**

Run: `powershell -File scripts/cutover/database-reconcile.ps1 -Phase Verify`

Expected: target ref correct; target backup digest valid; source archive digest valid; rehearsal `pass=true`; target is not serving the public frontend; no private artifact is tracked by Git.

- [ ] **Step 2: Apply only the eight reconciled migrations through a temporary whitelist workdir**

Copy exactly these files to a protected temporary Supabase workdir and run a dry run followed by migration up against the target database URL:

```text
20260720111916_add_website_editor_role.sql
20260720115031_create_website_cms_foundation.sql
20260720225347_harden_website_cms_integration.sql
20260721035032_add_website_page_publishing.sql
20260721100403_switch_tracking_to_google.sql
20260721162256_restore_staff_messages.sql
20260721170000_create_general_website_page_rpc.sql
20260721174422_preserve_source_cutover_fields.sql
```

Expected: dry run lists only those eight; apply succeeds; each is recorded once; the three target hardening migrations already represented as `20260718093731`, `20260718102253`, and `20260718110721` are not replayed.

- [ ] **Step 3: Import public data in a single guarded transaction**

The import truncates only source-owned application tables represented in the approved archive, never managed schemas or `supabase_migrations`. It disables user triggers only within the controlled import transaction where necessary, restores table data in dependency order, resets sequences from `max(id)`, reenables triggers, and validates foreign keys before commit. `public.staff_messages` data is held until its hardened schema exists.

Run: `powershell -File scripts/cutover/database-reconcile.ps1 -Phase Import`

Expected: transaction commits once; no managed schema definition is replaced; no constraint failure; row-count report is written outside Git.

- [ ] **Step 4: Import only portable Auth users and identities**

The generated Auth SQL inserts the 11 source `auth.users` rows and 11 `auth.identities` rows with source UUIDs, encrypted password hashes, confirmation state, `raw_app_meta_data`, and provider linkage. It excludes `auth.sessions`, `auth.refresh_tokens`, one-time tokens, audit logs, MFA challenges, and instance settings.

Expected queries: `select count(*) from auth.users` returns `11`; `select count(*) from auth.identities` returns `11`; no source session or refresh-token row was inserted. Existing target count was zero, so UUID conflicts must be zero.

- [ ] **Step 5: Restore `staff_messages` data and run integrity checks**

Expected checks: public table counts match approved source counts or a documented target-only exception; zero orphan foreign keys; zero duplicate unique keys; every non-null constraint passes; sequences exceed current maxima; 11 Auth users map to application profiles; all 13 approved service-list strings remain exact.

- [ ] **Step 6: Run database advisors and commit no generated private artifact**

Expected: no new critical/high security or performance finding on the changed surface. Keep the full advisor output outside Git. If the import or a gate fails, run `-Phase Rollback` using `target-before-cutover.backup` and stop before frontend cutover.

---

### Task 5: Storage Byte Migration and Verification

**Files:**
- Create: `scripts/cutover/storage-migrate.mjs`
- Create outside Git: `source-storage-manifest.json`, `target-storage-manifest.json`, `storage-digests.json`

**Interfaces:**
- Consumes: source object metadata from the approved archive, source public URLs, authenticated source UI access for private objects, and target service credentials from the protected environment.
- Produces: matching target buckets and verified file bytes with original object names, MIME types, privacy, and byte/digest evidence.

- [ ] **Step 1: Implement manifest validation before upload**

The script must require these exact expected source counts: `gallery=39`, `team-photos=9`, `videos=1`, `clinic-assets=2`, `assets=1`, `visit-attachment=5`, `daily-reports=112`, `database_export_16_07_26=1`. It records `panel-claim-docs` and `database_export_21_07_26` even when their object count is zero.

- [ ] **Step 2: Download public object bytes from canonical public URLs**

Run the `download-public` phase. For every public object, require HTTP 200, non-zero bytes, metadata size agreement when available, and a SHA-256 digest. A 404, zero-byte file, or name mismatch exits non-zero.

- [ ] **Step 3: Retrieve private objects through the existing authenticated source interface**

Use the logged-in browser session only through visible application functionality; do not inspect or export cookies, local storage, access tokens, or browser secrets. Download 5 `visit-attachment`, 112 `daily-reports`, and 1 `database_export_16_07_26` object into the protected cutover directory. Preserve names and private classification.

- [ ] **Step 4: Create target buckets and upload verified bytes**

Use the target service credential only from the protected environment. Create or reconcile bucket privacy before object upload. Public buckets stay public; private buckets stay private. Never generate public signed links for private clinical objects as a shortcut.

- [ ] **Step 5: Verify every target object by count, size, digest, and access boundary**

Expected: all listed counts match; all retrievable source and target digests match; anonymous GET succeeds only for public buckets; anonymous list/download fails for private buckets. Any missing private object is a hard stop before Task 7's GitHub value switch.

- [ ] **Step 6: Commit only the secret-free migration script**

```powershell
git add scripts/cutover/storage-migrate.mjs
git commit -m "chore: add verified storage migration tool"
```

---

### Task 6: Edge Functions and Runtime Configuration

**Files:**
- Create: `scripts/cutover/edge-function-contract.mjs`
- Test: `src/test/edge-function-cutover-contract.test.ts`
- Deploy from: `supabase/functions/admin-create-user`, `elevenlabs-scribe-token`, `generate-bio`, `generate-blog-content`, `generate-tts`, `publish-scheduled-posts`, `structure-medical-notes`, `submit-appointment`, `video-payment`, `video-room`, `video-webhook`

**Interfaces:**
- Consumes: function source, `supabase/config.toml`, protected target secret-name inventory.
- Produces: 11 deployed target Edge Functions with matching JWT settings and verified auth/OPTIONS behavior.

- [ ] **Step 1: Write a failing static inventory test**

The test expects exactly the 11 deployable function directories, excludes `_shared` and `tests`, parses all `Deno.env.get("NAME")` calls, and asserts that output contains names only, never values.

- [ ] **Step 2: Implement the contract inventory and run tests**

Run: `npm test -- src/test/edge-function-cutover-contract.test.ts`

Expected: PASS and a deterministic required-secret-name set.

- [ ] **Step 3: Compare required secret names with target secret names**

Never read or print values. Expected platform-provided names include `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Every required third-party name must be present before its dependent function deploys. A missing name blocks that dependent function and the frontend cutover.

- [ ] **Step 4: Deploy each function with its reviewed JWT configuration**

Deploy the 11 functions to `nhjbqdiyptjqherdfbqk` from repository source. `verify_jwt` must match the corresponding entry in `supabase/config.toml`; do not relax authentication to make a probe pass.

- [ ] **Step 5: Verify deployment and logs without real-data writes**

Expected: OPTIONS/CORS behavior succeeds where implemented; protected endpoints reject missing/invalid auth; public appointment and payment endpoints are not submitted; function logs show no module-load, missing-secret, or permission failure.

- [ ] **Step 6: Commit the inventory code**

```powershell
git add scripts/cutover/edge-function-contract.mjs src/test/edge-function-cutover-contract.test.ts
git commit -m "test: verify production edge function contract"
```

---

### Task 7: Rebind the Repository and Protect Production from Fixtures

**Files:**
- Modify: `supabase/config.toml`
- Modify: `public/_headers`
- Modify: `src/config/supabase-build-config.ts`
- Modify: `src/pages/tv/QueueTV.tsx`
- Modify: `stress-tests/.env.staging.example`
- Modify: `stress-tests/README.md`
- Modify: `stress-tests/scripts/guard-not-prod.sh`
- Modify: `stress-tests/scripts/v7/guard-not-prod.sh`
- Modify: `stress-tests/phase-d/seed-rls-matrix.sql`
- Modify: `stress-tests/phase-d/cleanup-rls-matrix.sql`
- Modify: `stress-tests/phase-d/bootstrap-rls-staging.sql`
- Create: `src/test/production-backend-reference.test.ts`
- Modify: `src/test/supabase-build-config.test.ts`

**Interfaces:**
- Consumes: target public URL, target publishable key, target project ref, and passing Tasks 3-6.
- Produces: application/runtime configuration that references only `nhjbqdiyptjqherdfbqk`; stress tooling refuses that ref as production.

- [ ] **Step 1: Write failing active-reference tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const activeFiles = [
  "public/_headers",
  "supabase/config.toml",
  "src/config/supabase-build-config.ts",
  "src/pages/tv/QueueTV.tsx",
  "stress-tests/scripts/guard-not-prod.sh",
  "stress-tests/scripts/v7/guard-not-prod.sh",
  "stress-tests/phase-d/seed-rls-matrix.sql",
  "stress-tests/phase-d/cleanup-rls-matrix.sql",
  "stress-tests/phase-d/bootstrap-rls-staging.sql",
];

describe("production backend references", () => {
  it.each(activeFiles)("removes the Lovable Cloud ref from %s", (file) => {
    expect(readFileSync(file, "utf8")).not.toContain("ncysmppzfjtiekfnomdv");
  });

  it("locks the promoted project into production guards", () => {
    const guard = readFileSync("stress-tests/scripts/guard-not-prod.sh", "utf8");
    expect(guard).toContain("nhjbqdiyptjqherdfbqk");
  });
});
```

- [ ] **Step 2: Run focused tests and observe old-reference failures**

Run: `npm test -- src/test/production-backend-reference.test.ts src/test/supabase-build-config.test.ts`

Expected: FAIL with active references to `ncysmppzfjtiekfnomdv`.

- [ ] **Step 3: Update public runtime configuration**

Set the production fallback URL to `https://nhjbqdiyptjqherdfbqk.supabase.co`, project ID to `nhjbqdiyptjqherdfbqk`, and publishable key to the target's browser-safe publishable/anon value obtained from the Supabase project. Never add a service-role or secret key. Update CSP `connect-src` and the Queue TV public chime URL to the target host.

- [ ] **Step 4: Make every destructive-test guard recognize the promoted target as production**

Replace the old production project ref with `nhjbqdiyptjqherdfbqk` in both shell guards and all Phase D SQL self-guards. Update the staging example and README to require a different, sanitized, disposable project. Existing protected `staging.env` must be renamed to a production-labeled protected file and must not be accepted by stress-test runners.

- [ ] **Step 5: Run focused and full static tests**

Run: `npm test -- src/test/production-backend-reference.test.ts src/test/supabase-build-config.test.ts`

Expected: PASS.

Run: `rg -n "ncysmppzfjtiekfnomdv" public supabase/config.toml src stress-tests --glob '!**/*.md'`

Expected: no active runtime/config match. Historical design/plan documents may retain the source reference as audit history.

- [ ] **Step 6: Commit**

```powershell
git add public/_headers supabase/config.toml src/config/supabase-build-config.ts src/pages/tv/QueueTV.tsx stress-tests/.env.staging.example stress-tests/README.md stress-tests/scripts/guard-not-prod.sh stress-tests/scripts/v7/guard-not-prod.sh stress-tests/phase-d/seed-rls-matrix.sql stress-tests/phase-d/cleanup-rls-matrix.sql stress-tests/phase-d/bootstrap-rls-staging.sql src/test/production-backend-reference.test.ts src/test/supabase-build-config.test.ts
git commit -m "chore: bind production to owned Supabase project"
```

---

### Task 8: Final Verification, Review, Merge, and Production Cutover

**Files:**
- Modify only through protected GitHub repository settings: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- Preserve outside Git: final database, Auth, Storage, Edge Function, CI, and rollback reports.

**Interfaces:**
- Consumes: reviewed branch, passing backend/storage/function gates, protected GitHub credentials.
- Produces: deployed `klinikawfa.com` using `nhjbqdiyptjqherdfbqk` with rollback evidence.

- [ ] **Step 1: Run the complete local validation suite**

```powershell
npm ci
npm run lint:changed
npx tsc --noEmit
npm test
deno test supabase/functions/_shared/secure-random_test.ts
deno test --allow-net --allow-env supabase/functions/tests/ai.test.ts
npm run build
npm run build:dev
```

Expected: every command exits 0. Pre-existing bundle-size and React Router future-flag warnings are informational only if unchanged.

- [ ] **Step 2: Run dependency and private-file gates**

Run the same fail-closed public-registry production audit used by `.github/workflows/security-gate.yml`.

Expected: valid JSON, zero high, zero critical. Then verify Git tracks no private `.env`, database export, credential file, `node_modules`, `dist`, storage bytes, or cutover report.

- [ ] **Step 3: Run final Supabase security and behavior checks**

Expected: no critical/high advisor finding on changed surfaces; RLS role matrix passes against a sanitized non-production project; production read-only probes confirm anonymous public content, deny anonymous/private data, deny Website Editor clinic/finance/patient access, and allow CMS configuration only to `admin`, `special_admin`, `doctor_admin`, and `website_editor`.

- [ ] **Step 4: Push a review branch and require GitHub Security Gate success**

Push the commits, open a pull request to `main`, inspect the complete diff, and wait for the Security Gate. Do not merge on a skipped, pending, or failed gate.

- [ ] **Step 5: Record the rollback state and switch protected frontend values**

Record the current live commit SHA and the three old public frontend values in the protected rollback report without printing them. Update GitHub Actions secrets/variables to URL `https://nhjbqdiyptjqherdfbqk.supabase.co`, the target publishable key, and project ID `nhjbqdiyptjqherdfbqk`. Never store the service-role key in GitHub frontend configuration.

- [ ] **Step 6: Merge and let GitHub Pages publish the reviewed commit**

Expected: Pages workflow succeeds; HTTPS remains enforced; DNS/custom domain remains unchanged. Verify the deployed JavaScript contains `nhjbqdiyptjqherdfbqk` and no longer contains `ncysmppzfjtiekfnomdv`.

- [ ] **Step 7: Perform read-only production verification**

Verify desktop and mobile homepage, direct routes, all service routes, gallery/media, login page, appointment page without submission, CMS preview-at-bottom, public page publishing/restore UI without changing production content, and browser console. Verify Google Analytics/Ads makes no request before consent and never tracks protected healthcare routes. Verify representative existing users can sign in again and are forced to establish new sessions.

- [ ] **Step 8: Close or roll back**

Success requires all live checks, Storage counts/privacy, Auth/RLS boundaries, and function probes to pass. On failure, immediately restore the three old GitHub frontend values and redeploy the previous live commit; restore the target pre-cutover backup only if target data integrity was affected. Keep the Lovable Cloud source untouched throughout the verification window.
