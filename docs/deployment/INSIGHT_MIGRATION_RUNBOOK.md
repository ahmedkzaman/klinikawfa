# Insight Migration Runbook (Task 10)

**Scope:** Apply the 8 Insight performance migrations to the approved validation Supabase project, verify with the executable role fixture, then production — only after explicit approval.

**Status:** PREPARED (not executed). No database has been touched by this runbook yet.

## What will be applied

The Insight-migration block, in timestamp order (it may be applied alongside any other pending local migrations, but these are the ones the Insight Performance tab depends on):

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260816120000_add_insight_performance_report.sql` | Secured `get_insight_performance` RPC + supporting indexes |
| 2 | `20260817120000_complete_insight_performance_details.sql` | Completes performance detail rows |
| 3 | `20260817130000_complete_insight_workspace_security_filters.sql` | Workspace security filters |
| 4 | `20260817140000_harden_insight_refresh_and_filtered_semantics.sql` | Refresh + filtered semantics hardening |
| 5 | `20260817150000_enforce_insight_doctor_visibility_and_cohorts.sql` | Doctor visibility + cohort enforcement |
| 6 | `20260817160000_complete_insight_document_rows_and_attendance_roster.sql` | Document rows + attendance roster |
| 7 | `20260817170000_exclude_payment_only_doctor_activity.sql` | Exclude payment-only doctor activity |

Supporting (panel receipts, referenced by finance):
- `20260817090000_add_panel_receipt_summary.sql`
- `20260817100000_harden_panel_receipt_history.sql`
- `20260817110000_exclude_reassigned_panel_receipt_backfills.sql`

**Remote history check first:** the linked project may already have some of these applied (the deployed site has been live since 2026-08-17). `supabase migration list --linked` will show Local ↔ Remote state; only genuinely pending migrations get pushed.

## Pre-flight (one-time, local machine)

1. **Supabase access token** — create at https://supabase.com/dashboard/account/tokens
   ```powershell
   $env:SUPABASE_ACCESS_TOKEN = "<token>"
   ```
2. **Link the VALIDATION project first** (never production first):
   ```powershell
   npx supabase link --project-ref <VALIDATION_REF>
   ```
3. Confirm the link:
   ```powershell
   npx supabase migration list --linked
   ```

## Step 1 — Backup the validation project

- Take a dashboard backup (Database → Backups) or use `pg_dump` with the project's connection string; store the artifact in the user-approved Downloads backup folder, named with project ref + UTC timestamp.
- Verify the backup is non-empty and record its checksum. Never print connection strings or tokens in logs.

## Step 2 — Apply to validation

```powershell
npx supabase db push --linked --dry-run   # confirm the pending list matches expectations
npx supabase db push --linked             # apply
```

## Step 3 — Verify with the executable role fixture

```powershell
npx supabase db test --linked supabase/tests/insight_performance.sql
```

Expected: exact JSON visibility and metric values for doctor admin, resident doctor, operations, locum, and guest — the fixture wraps everything in a transaction ending in ROLLBACK, so it leaves no data behind.

Then exercise the RPC directly per role (any SQL client on the validation DB):

```sql
select public.get_insight_performance('2026-08-01'::date, '2026-08-31'::date);
```

Check:
- admin/special_admin → named doctor rows + services
- resident_doctor → only own doctor row + anonymized clinic benchmark
- operations → `doctors: []`, services retained
- locum / guest → SQLSTATE 42501

## Step 4 — Browser QA on validation build

Four sections at desktop + 390px widths for doctor_admin, resident_doctor, operations, locum, guest. Verify URL restoration, active-only queries, exports, deep links, empty/error/partial states, named-doctor restrictions, zero console errors. The local harness (`insight-preview.html` + `vite.preview.config.ts`) can be pointed at the validation project's URL/anon key for a quick visual pass before deploying.

## Step 5 — Production approval gate

Present to the owner: migration list, backup evidence, test/build results, fixture output, validation screenshots, rollback instructions. **Do not apply production migrations or push main before explicit approval.**

## Step 6 — Production deploy order

1. Backup production (same as Step 1).
2. `npx supabase link --project-ref <PRODUCTION_REF>` then `npx supabase db push --linked`.
3. Verify schema cache: `select public.get_insight_performance(...)` as before.
4. Push the reviewed commit to main (already pushed: `b6d28c3`), watch Security Gate + Deploy GitHub Pages to completion.
5. 30-minute canary: `/clinic/insight` availability, console errors, RPC error rate, section latency, the four role policies, financial reconciliation, one doctor detail, one service detail, one planning recommendation, CSV exports. Stop/rollback on role leakage, financial mismatch, repeated RPC timeouts, or page-level unavailability.

## Rollback

- Application rollback first (revert main to `19c75ab` and redeploy).
- The RPC migrations are additive (new function + indexes); they are harmless to leave in place and can only be removed by a separately reviewed migration.

## Hard rules

- NEVER point tooling at project ref `ncysmppzfjtiekfnomdv` (production stress-test rule from security-gate).
- Stress tests must not target the production project.
- No tokens or connection strings in logs, commits, or this repo.

---

## Deployment Record — 2026-08-19 (Validation Outcome: NO MIGRATION REQUIRED)

**Prepared by:** Hermes agent, at user request ("prep the migration"), with user-supplied
service key. All remote operations were READ-ONLY (REST GET/POST to RPC probes only —
no schema changes, no data writes, no migrations pushed).

### Finding: production is already fully migrated

Target project `nhjbqdiyptjqherdfbqk` (klinikawfa production backend per the
2026-07-22 cutover spec; NOT the legacy `ncysmppzfjtiekfnomdv`):

| Check | Result |
|---|---|
| Insight RPC family present | 25 insight-related RPCs exposed, incl. `get_insight_performance`, `_filtered`, `_detail_filtered`, `viewer_scope`, financial-control summary/details, attendance heatmap, clinic health |
| Marker of last migration (`20260817170000`) | `_get_doctor_clinical_activity_before_payment_only_filter` PRESENT |
| Markers of `20260817150000`/`20260817160000` | `_round3`/`_round4` internal wrappers PRESENT (rename-and-wrap security pattern, REVOKEd from all roles) |
| Frontend↔schema arg parity | `get_insight_performance_filtered(_start_date,_end_date,_doctor_id,_payment_type,_activity_type,_include_comparison)` and every other RPC signature matches repo hooks exactly |
| Anonymous access (publishable key) | DENIED on every insight RPC (401/403 `42501`) |
| Service-key caller (no user JWT) | DENIED (`NOT_AUTHORIZED`) — guards resolve real identity via `auth.uid()` |
| Live bundle (klinikawfa.com, built from `b6d28c3` 2026-08-19 16:47 UTC) | Contains the same RPC names + arg generation as repo HEAD |

**Conclusion:** the 7 insight migrations (20260816120000 → 20260817170000) were already
applied to production before this session. The Performance tab's data layer is live and
role-guarded. Nothing to `db push`.

### Residual work (requires real user credentials — not doable with service key alone)
- Browser QA per role (doctor_admin / resident_doctor / ops_staff / locum / guest) on
  the live site: needs actual sign-ins.
- Performance latency check under real usage (RPC execution path verified, timings not measured).
