# Lovable Cloud to Supabase Production Cutover Design

**Status:** Approved design
**Date:** 2026-07-22
**Live source project:** `ncysmppzfjtiekfnomdv` (Lovable Cloud, owner-level access unavailable)
**New production project:** `nhjbqdiyptjqherdfbqk` (currently named klinikawfa-staging)

## Objective

Promote the existing `nhjbqdiyptjqherdfbqk` Supabase project into the Klinik Awfa production backend without losing production records, weakening security controls, exposing secrets, or changing user-facing content. The live website will continue using the Lovable Cloud project until every database, authentication, Storage, Edge Function, and frontend gate passes.

## Approved Source Artifact

Use only `klinikawfa_260721.backup`, stored outside the repository.

- Internal archive creation time: `2026-07-21 16:08:27`
- Format: PostgreSQL custom archive, zstd compression
- Source PostgreSQL version: `17.6`
- `pg_dump` version: `18.4`
- Size: `1,688,357` bytes
- SHA-256: `16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863`
- Auth users: 11
- Auth identities: 11
- Storage object metadata rows: 170

The user confirmed that no source-system records changed after this export. The older 16 July archive is not an approved migration source.

## Chosen Approach

Promote the existing target project in place while preserving its newer Supabase-managed schema and security hardening. Do not perform a full destructive restore of the archive.

The migration will restore application-owned data and the minimum portable Auth records into the target's existing schema. Supabase-managed infrastructure, target migration history, secrets, project configuration, and active target schema remain authoritative.

Rejected alternatives:

- **Full archive overwrite:** faster, but may replace newer RLS, functions, Supabase-managed schemas, migration history, or platform configuration.
- **A third clean project:** offers isolation but adds provisioning and secret-management work without improving the data-reconciliation problem.

## Safety Boundaries

Before any target write:

1. Verify the target project reference exactly equals `nhjbqdiyptjqherdfbqk`.
2. Create a full target database backup outside the repository and record its SHA-256.
3. Inventory target Auth users, public-table row counts, Storage buckets and object counts, migration history, extensions, functions, policies, and Edge Functions without displaying private record contents.
4. Confirm the source archive SHA-256 matches the approved fingerprint.
5. Confirm no production secret value, database password, service-role key, export, or patient data is added to Git.

The live site, DNS, GitHub Pages, GitHub environment variables, and source Lovable Cloud project remain unchanged during preparation.

## Database Migration

Use a scratch restore first to map archive tables to the current target schema and detect column, constraint, enum, trigger, extension, and ownership differences. The scratch restore is disposable and never serves production traffic.

For the target import:

- Preserve `supabase_migrations.schema_migrations` from the target.
- Preserve Supabase platform configuration and schema migrations in `auth`, `storage`, `realtime`, `vault`, `extensions`, and other managed schemas.
- Import application-owned `public` data in dependency order inside an explicitly controlled maintenance window.
- Reconcile sequences and identity values after import.
- Restore only portable Auth identity data required for the 11 users: user IDs, password hashes, app metadata, confirmation state, and provider identities.
- Do not restore Auth sessions, refresh tokens, one-time tokens, audit log entries, or platform instance configuration. All users must sign in again after cutover.
- Do not overwrite target schema definitions with source definitions.
- Run foreign-key, uniqueness, not-null, orphan, sequence, and row-count reconciliation before proceeding.

Any unexplained row-count difference, constraint failure, or schema incompatibility stops the cutover and triggers target rollback.

## Storage Migration

The database archive contains Storage metadata, not proof that the underlying file bytes are included. Treat object copying as a separate mandatory migration.

Expected source inventory:

- `gallery`: 39 public objects
- `team-photos`: 9 public objects
- `videos`: 1 public object
- `clinic-assets`: 2 public objects
- `assets`: 1 public object
- `visit-attachment`: 5 private objects
- `daily-reports`: 112 private objects
- `database_export_16_07_26`: 1 private object
- Bucket metadata also includes `panel-claim-docs` and `database_export_21_07_26`

Copy file bytes into matching target buckets using authenticated, non-public tooling. Preserve object names, MIME metadata, ownership references where valid, and bucket privacy. Verify every expected file by count, size, and cryptographic digest where the source allows it.

Private clinical files must never be made public as a migration shortcut. If any private source object cannot be retrieved or verified, stop before frontend cutover.

## Security and CMS Migrations

After data reconciliation, apply only migrations not already represented in the target schema. The six CMS/Website Editor migrations requiring explicit reconciliation are:

1. `20260720111916_add_website_editor_role.sql`
2. `20260720115031_create_website_cms_foundation.sql`
3. `20260720225347_harden_website_cms_integration.sql`
4. `20260721035032_add_website_page_publishing.sql`
5. `20260721100403_switch_tracking_to_google.sql`
6. `20260721170000_create_general_website_page_rpc.sql`

Migration application must be deterministic and recorded in the target migration history. Do not replay an equivalent migration under a second identity. Reconcile by schema effect and migration history before applying.

Authorization must retain these Website Editor roles: `admin`, `special_admin`, `doctor_admin`, and `website_editor`. The `website_editor` role remains excluded from clinic operations, finance, patient records, workforce administration, and privileged system settings.

Run database advisors and the RLS role matrix after migration. No critical or high security finding may remain open for the changed surface.

## Edge Functions and Secrets

Inventory required Edge Functions and secret names from the repository and target runtime. Deploy functions only after their dependencies and RLS policies exist.

- Never copy secret values into source files, migration files, logs, reports, or chat.
- Reuse protected target secrets where valid.
- Missing third-party secrets are a hard stop for the dependent function, not a reason to add fallback credentials.
- Verify JWT settings and callable roles against `supabase/config.toml` and the deployed function configuration.

## Frontend Cutover

Only after all backend gates pass:

1. Update the protected GitHub Actions values for `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` to target project values.
2. Keep service-role and database credentials out of GitHub frontend variables.
3. Build from the reviewed commit and allow the existing GitHub Pages workflow to deploy.
4. Verify the deployed JavaScript references `nhjbqdiyptjqherdfbqk` and no longer references `ncysmppzfjtiekfnomdv`.
5. Do not change DNS or the custom domain.

## Validation Gates

The cutover requires all of the following:

- Clean dependency install, TypeScript, lint, frontend unit tests, Deno tests, production build, development build, dependency audit, and private-file scan.
- Expected public/application row counts and no integrity violations.
- Successful sign-in for representative approved roles after forced reauthentication.
- Anonymous public reads limited to intended public content.
- RLS denial tests for unauthenticated users, Website Editor clinic access, cross-user access, and privileged financial/clinical operations.
- Website Editor access for `admin`, `special_admin`, `doctor_admin`, and `website_editor` only.
- Website Editor page create, draft, preview-at-bottom, publish, restore, navigation, media, gallery, doctors, services, reviews, and Google-consent configuration workflows.
- Public homepage, direct routes, service routes, gallery/media, authentication, appointments without submission, and console checks.
- Consent-gated Google Analytics and Google Ads behavior: no request before consent and no tracking on protected healthcare routes.
- Every expected Storage object present and private buckets still private.
- No production form submission, payment, appointment creation, patient update, or other real-data mutation during smoke testing.

## Rollback

Rollback remains available until production verification is complete:

- Revert the three protected GitHub frontend Supabase values to the Lovable Cloud project and redeploy the last known-good frontend commit.
- Restore the target from its pre-migration backup if target state must be reset.
- Retain migration logs, row-count reports, object digests, and the exact deployed commit SHA outside the public repository when they contain operational details.
- Do not delete or modify the Lovable Cloud source project during the migration or verification window.

## Stop Conditions

Stop without frontend cutover if any of these occurs:

- Source archive fingerprint mismatch.
- Target backup failure.
- Unresolved schema or migration-history ambiguity.
- Missing or unverifiable private Storage object.
- Auth user or identity mismatch.
- RLS matrix failure or critical/high advisor finding.
- Missing required Edge Function secret.
- CI, build, test, or dependency-audit failure.
- Live verification shows wrong database reference, broken route, console error, or unintended data exposure.

## Success Condition

The migration is complete only when `klinikawfa.com` is deployed from the reviewed GitHub commit, uses `nhjbqdiyptjqherdfbqk`, passes all backend/frontend/security/storage/authentication checks, and retains a tested rollback path to the untouched Lovable Cloud source.
