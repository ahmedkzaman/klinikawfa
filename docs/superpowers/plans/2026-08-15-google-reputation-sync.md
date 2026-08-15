# Google Reputation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual Google actuals in the Management Dashboard with daily verified Google Business Profile rating and review totals while preserving editable monthly targets and safe stale-data behaviour.

**Architecture:** A Supabase Edge Function uses a server-held Google OAuth refresh token to call the official Business Profile Reviews API and store one idempotent daily snapshot. Staff-authorized aggregate RPCs expose only the latest value, month growth, last sync, and connection state. A dedicated Growth & Marketing panel renders read-only Google actuals beside target-only edit controls, while GitHub Actions triggers the server function daily.

**Tech Stack:** Google Business Profile Reviews API, OAuth 2.0 refresh tokens, Supabase Edge Functions/Deno, PostgreSQL/Supabase RLS and RPC, GitHub Actions, React, TypeScript, TanStack Query, Vitest.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-15-patient-attendance-heatmap-google-reputation-design.md`.
- Use only the official Google Business Profile API; do not scrape Search or Maps.
- Never expose Google client secret, refresh token, cron secret, or service-role key to browser code, logs, repository files, GitHub artifacts, or test snapshots.
- Keep the most recent verified values on failure and label them stale; never substitute zero.
- The rating actual and total-review actual are read-only.
- Preserve editable targets: rating target `4.5`; reviews target means `100 new reviews/month`.
- Store daily Malaysia-local snapshots so month growth is reproducible.
- A missing month-opening baseline must display monthly growth as unavailable, not zero.
- A one-time Google Cloud/API approval and OAuth connection is an external setup prerequisite, not a reason to weaken credential handling.

---

## Task 1: Add snapshot storage and aggregate reporting

**Files:**

- Create: `supabase/migrations/20260815150000_add_google_reputation_snapshots.sql`
- Create: `src/test/google-reputation-migration.test.ts`
- Create: `supabase/tests/google_reputation.sql`
- Modify: `src/integrations/supabase/types.ts` only through the repository's established generated-type workflow after schema verification

- [ ] **Step 1: Write failing migration-contract tests**

Require:

```sql
public.google_reputation_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  location_resource text not null,
  observed_on date not null,
  average_rating numeric(2,1) not null,
  total_review_count integer not null,
  synced_at timestamptz not null default now(),
  unique (source, location_resource, observed_on)
)
```

Add checks for source, rating 0-5, and non-negative review count. Require RLS, no anonymous access, Management Dashboard read authorization, and no authenticated direct write.

- [ ] **Step 2: Specify secure database interfaces**

Create:

```sql
public.get_google_reputation_summary(_month_start date) returns jsonb
```

It returns:

```ts
{
  latestRating: number | null;
  latestTotalReviews: number | null;
  monthOpeningTotal: number | null;
  newReviewsThisMonth: number | null;
  lastSyncedAt: string | null;
  stale: boolean;
  locationResource: string | null;
}
```

Create a secure snapshot-recording function callable only by the service role. It must upsert the same `(source, location_resource, observed_on)` row so retries are idempotent, and it must never overwrite a verified snapshot with null/zero due to an API error.

- [ ] **Step 3: Write executable SQL fixtures**

Cover first-ever snapshot, multiple snapshots in a month, prior-month baseline, same-day idempotent update, stale threshold, target-independent actuals, unauthorized read, authenticated direct-write rejection, and service-role recording.

- [ ] **Step 4: Implement and verify the migration**

Run:

```powershell
npm test -- src/test/google-reputation-migration.test.ts
npx supabase db push --dry-run --linked --skip-vault
```

Run the executable SQL fixture in an approved non-production Supabase environment before production apply.

- [ ] **Step 5: Regenerate and validate types**

Regenerate from the validated linked schema using the project's Supabase type-generation procedure. Confirm `google_reputation_snapshots` Row/Insert/Update and both RPC signatures are in the correct sections.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260815150000_add_google_reputation_snapshots.sql supabase/tests/google_reputation.sql src/test/google-reputation-migration.test.ts src/integrations/supabase/types.ts
git commit -m "feat: store verified Google reputation snapshots"
```

---

## Task 2: Implement the server-side Google sync

**Files:**

- Create: `supabase/functions/sync-google-reputation/index.ts`
- Create: `supabase/functions/sync-google-reputation/handler.ts`
- Create: `supabase/functions/sync-google-reputation/handler_test.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write failing dependency-injected handler tests**

Test:

- OAuth token refresh request;
- request to `https://mybusiness.googleapis.com/v4/{location}/reviews?pageSize=1`;
- mapping `averageRating` and `totalReviewCount`;
- Malaysia-local `observed_on`;
- idempotent snapshot call;
- cron-secret authorization;
- authenticated administrator manual refresh;
- unauthorized caller rejection;
- API 401/revoked refresh token;
- rate-limit/server/network errors that preserve prior data;
- redacted errors that never echo secrets.

Run with the repository's Deno test command used by existing Edge Function tests. Expected initially: FAIL because the function does not exist.

- [ ] **Step 2: Implement a pure handler with injected dependencies**

Define:

```ts
type GoogleReputationDependencies = {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  recordSnapshot: (snapshot: GoogleReputationSnapshotInput) => Promise<void>;
  authorizeAdmin: (authorization: string | null) => Promise<boolean>;
};
```

Read these server-side secrets only:

- `GOOGLE_BUSINESS_CLIENT_ID`
- `GOOGLE_BUSINESS_CLIENT_SECRET`
- `GOOGLE_BUSINESS_REFRESH_TOKEN`
- `GOOGLE_BUSINESS_LOCATION`
- `GOOGLE_REPUTATION_CRON_SECRET`

Refresh the OAuth token at Google's token endpoint, fetch reviews with `pageSize=1`, validate finite rating/count, then record a snapshot. Return a concise JSON success/error envelope without credentials.

- [ ] **Step 3: Add dual caller authorization**

- Scheduled request: require exact `x-cron-secret` match.
- Manual request: require bearer JWT and `can_edit_management_dashboard` authorization.
- Apply a server-side minimum refresh interval for manual requests to avoid accidental repeated Google calls.

- [ ] **Step 4: Register the Edge Function**

Add:

```toml
[functions.sync-google-reputation]
verify_jwt = false
```

The handler must still enforce cron-secret or administrator JWT itself because scheduled callers do not use a staff JWT.

- [ ] **Step 5: Verify and commit**

Run the focused Deno tests and a local request with mocked Google responses. Then:

```powershell
git add supabase/functions/sync-google-reputation supabase/config.toml
git commit -m "feat: sync Google Business reputation securely"
```

---

## Task 3: Add the Google summary hook and target-only model

**Files:**

- Create: `src/hooks/clinic/useGoogleReputation.ts`
- Create: `src/lib/clinic/googleReputation.ts`
- Create: `src/test/google-reputation-hook.test.tsx`
- Modify: `src/lib/clinic/managementDashboard.ts`

- [ ] **Step 1: Write failing normalization and hook tests**

Cover latest values, month growth, missing baseline, stale values, null initial state, last sync, error handling, month-dependent query key, and manual refresh invalidation.

- [ ] **Step 2: Implement the read contract**

Export:

```ts
export type GoogleReputationSummary = {
  latestRating: number | null;
  latestTotalReviews: number | null;
  monthOpeningTotal: number | null;
  newReviewsThisMonth: number | null;
  lastSyncedAt: string | null;
  stale: boolean;
  locationResource: string | null;
};

export function useGoogleReputation(monthStart: string): UseQueryResult<GoogleReputationSummary>;
export function useRefreshGoogleReputation(): UseMutationResult<GoogleReputationSummary, Error, void>;
```

Use `['google-reputation-summary', monthStart]`. Manual refresh invokes the Edge Function with the current user JWT, then invalidates the summary query.

- [ ] **Step 3: Clarify target semantics**

Keep `google_rating` and `google_reviews` in `MANAGEMENT_METRIC_DEFINITIONS`, but label the second target `New Google reviews this month` or append `/month`. Do not use `actual_numeric` from manual records as the Google actual after integration.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/test/google-reputation-hook.test.tsx
git add src/hooks/clinic/useGoogleReputation.ts src/lib/clinic/googleReputation.ts src/lib/clinic/managementDashboard.ts src/test/google-reputation-hook.test.tsx
git commit -m "feat: load verified Google reputation metrics"
```

---

## Task 4: Replace the two manual cards with verified Google cards

**Files:**

- Create: `src/components/clinic/dashboard/GoogleReputationCards.tsx`
- Create: `src/components/clinic/dashboard/GrowthMarketingPanel.tsx`
- Create: `src/components/clinic/dashboard/GoogleTargetDialog.tsx`
- Modify: `src/components/clinic/dashboard/ManualScorecardPanel.tsx`
- Modify: `src/pages/clinic/ManagementDashboard.tsx`
- Create: `src/test/google-reputation-cards.test.tsx`
- Create: `src/test/management-dashboard-google-reputation.test.tsx`

- [ ] **Step 1: Write failing card tests**

Test:

- rating displays `x.x / 5` and its target;
- reviews display lifetime total plus `+N this month` and monthly target;
- missing baseline says unavailable, not `+0`;
- stale badge and last successful sync;
- API error retains cached verified values;
- first-sync empty state;
- pencil edits only target values;
- actual inputs are absent/disabled;
- manual refresh visible only to authorized editors and throttling errors are clear;
- remaining Growth & Marketing manual metrics still render.

- [ ] **Step 2: Build dedicated Google cards**

`GoogleReputationCards` accepts the summary, targets, edit permission, edit callbacks, and refresh state. Use clear labels:

- `Google rating`: `4.7 / 5 · Target 4.5`
- `Google reviews`: `452 total · +N this month · Target 100/month`

Show a concrete `Last synced 15 Aug 2026, 8:15 AM`-style timestamp and `Data may be stale` when appropriate. Do not render zero when summary values are null.

- [ ] **Step 3: Build the combined Growth & Marketing panel**

`GrowthMarketingPanel` renders the two automatic Google cards first and delegates the remaining growth definitions to the existing manual card presentation. Add an exclusion option to `ManualScorecardPanel` or provide filtered definitions so Google cards are not duplicated.

- [ ] **Step 4: Add a target-only editor**

`GoogleTargetDialog` updates only `target_numeric` for `google_rating` and `google_reviews`. Preserve the current actual fields in storage for backward compatibility but stop displaying or overwriting them from this UI.

- [ ] **Step 5: Integrate independent loading/error behaviour**

The Management Dashboard must remain usable when Google is unconfigured or unavailable. Existing automatic and manual panels must not be blocked by this query.

- [ ] **Step 6: Verify and commit**

```powershell
npm test -- src/test/google-reputation-cards.test.tsx src/test/management-dashboard-google-reputation.test.tsx src/test/management-dashboard-page-contract.test.ts
git add src/components/clinic/dashboard/GoogleReputationCards.tsx src/components/clinic/dashboard/GrowthMarketingPanel.tsx src/components/clinic/dashboard/GoogleTargetDialog.tsx src/components/clinic/dashboard/ManualScorecardPanel.tsx src/pages/clinic/ManagementDashboard.tsx src/test/google-reputation-cards.test.tsx src/test/management-dashboard-google-reputation.test.tsx
git commit -m "feat: show live Google reputation on management dashboard"
```

---

## Task 5: Schedule one safe daily sync

**Files:**

- Create: `.github/workflows/sync-google-reputation.yml`
- Create: `src/test/google-reputation-workflow.test.ts`
- Modify: repository deployment/operator documentation in the existing appropriate operations document; if none exists, create `docs/google-reputation-setup.md`

- [ ] **Step 1: Write a failing workflow contract test**

Require:

- cron `15 0 * * *` (08:15 Malaysia);
- `workflow_dispatch`;
- least-privilege `contents: read`;
- concurrency to prevent overlapping syncs;
- Edge endpoint built from a repository secret/project setting;
- `x-cron-secret` from GitHub Actions secrets;
- failure on non-2xx response;
- no Google OAuth credentials in GitHub Actions.

- [ ] **Step 2: Implement the workflow**

POST to `/functions/v1/sync-google-reputation`. GitHub stores only the cron caller secret; Google OAuth credentials remain Supabase Edge secrets.

- [ ] **Step 3: Document one-time owner setup**

Document:

1. create/select the clinic Google Cloud project;
2. request/confirm Business Profile API access;
3. configure OAuth consent and obtain an offline refresh token for the verified owner account;
4. identify the canonical Google resource in the `accounts/{accountId}/locations/{locationId}` format;
5. set the five Supabase Edge secrets;
6. set the matching GitHub `GOOGLE_REPUTATION_CRON_SECRET` and Edge base URL/project secret;
7. deploy the function;
8. run a manual sync and verify one database snapshot;
9. trigger the workflow and verify the second idempotent call does not duplicate the daily row;
10. revoke/rotate credentials safely.

Do not place real secret examples in the document.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/test/google-reputation-workflow.test.ts
git add .github/workflows/sync-google-reputation.yml src/test/google-reputation-workflow.test.ts docs/google-reputation-setup.md
git commit -m "ci: schedule daily Google reputation sync"
```

---

## Task 6: Staging, production, and failure canary

- [ ] Confirm the Google owner/API approval has been completed before claiming automatic sync is live.
- [ ] Apply the snapshot migration in the approved non-production Supabase project.
- [ ] Set non-production Edge secrets without printing them.
- [ ] Deploy `sync-google-reputation` to non-production.
- [ ] Execute manual refresh, daily replay, bad-secret, revoked-token, malformed-response, and stale-data checks.
- [ ] Verify the dashboard never turns a failure into rating/review count zero.
- [ ] Run focused tests, `npx tsc --noEmit`, `npm run lint:changed`, `npm run build`, and `git diff --check`.
- [ ] Confirm the linked production migration dry-run lists only the intended migration.
- [ ] Apply the production migration, set production Edge secrets, deploy the function, and add the GitHub cron secret.
- [ ] Push through Security Gate and GitHub Pages deployment.
- [ ] Trigger the workflow manually and confirm the database has exactly one Malaysia-date snapshot.
- [ ] Confirm Growth & Marketing shows verified actuals, monthly target semantics, last sync, and correct stale handling.
