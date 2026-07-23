# Clinic Portal GitHub Pages Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 32 fixed `/clinic` routes return HTTP 200 when opened directly or refreshed on GitHub Pages while preserving existing authentication and role restrictions.

**Architecture:** Extend the existing GitHub Pages artifact-generation route list so every fixed clinic path receives a copy of the production `index.html`. Keep the current `404.html` SPA fallback for the three dynamic routes containing queue-entry IDs, because GitHub Pages cannot pre-generate arbitrary IDs.

**Tech Stack:** GitHub Actions YAML, GitHub Pages, Vite 8, React Router 6, Vitest 3, TypeScript 5, Node.js 24.

## Global Constraints

- Do not modify `src/App.tsx`, authentication redirects, role checks, RLS, Supabase, migrations, Edge Functions, secrets, clinic records, or production data.
- Preserve `/auth?redirect=<encoded-original-path>` for logged-out visitors.
- Keep `website_editor` and `guest` users outside the clinic portal.
- Generate static entry files only for fixed routes; retain the existing `dist/404.html` fallback for `clinic/consultation/:queueEntryId`, `clinic/queue/checkout/:queueEntryId`, and `clinic/visits/:queueEntryId`.
- Work only in the isolated `fix/clinic-pages-deep-links` branch.
- Do not include `.env`, credentials, `node_modules`, `dist`, audit output, or source maps in commits.

---

## File Structure

- Modify `.github/workflows/deploy-pages.yml`: declare the 32 fixed clinic routes and validate representative generated entry files before artifact upload.
- Modify `src/test/github-pages-hosting.test.ts`: enforce complete fixed clinic-route coverage in the deployment workflow.
- No application source, database, configuration-secret, or dependency file changes.

### Task 1: Add test-enforced clinic route coverage

**Files:**
- Modify: `src/test/github-pages-hosting.test.ts`
- Modify: `.github/workflows/deploy-pages.yml`
- Test: `src/test/github-pages-hosting.test.ts`

**Interfaces:**
- Consumes: the existing `routes=(...)` Bash array and loop in `.github/workflows/deploy-pages.yml`.
- Produces: `dist/<fixed-clinic-route>/index.html` for every route in `fixedClinicRoutes`.

- [ ] **Step 1: Add the fixed clinic route contract to the hosting test**

Insert this constant after `const readWorkflow = ...` in `src/test/github-pages-hosting.test.ts`:

```ts
const fixedClinicRoutes = [
  "clinic",
  "clinic/queue",
  "clinic/appointments",
  "clinic/video-calls",
  "clinic/patients",
  "clinic/consultation",
  "clinic/dispensary",
  "clinic/procurement",
  "clinic/procurement-dashboard",
  "clinic/seasonal-forecast",
  "clinic/billings",
  "clinic/panel-claims",
  "clinic/receivables",
  "clinic/inventory",
  "clinic/inventory/restock-review",
  "clinic/owe-slips",
  "clinic/insight",
  "clinic/settings",
  "clinic/settings/clinic-profile",
  "clinic/settings/preferences",
  "clinic/settings/users",
  "clinic/settings/locum-registration",
  "clinic/settings/inventory",
  "clinic/settings/diagnoses",
  "clinic/settings/panels",
  "clinic/settings/drug-label",
  "clinic/settings/documents",
  "clinic/settings/document-templates",
  "clinic/settings/charges",
  "clinic/settings/queue",
  "clinic/settings/procurement-rules",
  "clinic/voided",
] as const;
```

Add this test inside the existing `describe("GitHub Pages hosting", ...)` block:

```ts
  it("pre-renders every fixed clinic portal route", () => {
    const workflowLines = readWorkflow()
      .split(/\r?\n/)
      .map((line) => line.trim());

    for (const route of fixedClinicRoutes) {
      expect(workflowLines, `missing GitHub Pages route: ${route}`).toContain(route);
    }

    expect(readWorkflow()).toContain('mkdir -p "dist/${route}"');
    expect(readWorkflow()).toContain('cp dist/index.html "dist/${route}/index.html"');
  });
```

- [ ] **Step 2: Run the focused test and confirm the regression is exposed**

Run:

```powershell
$nodeDir = "C:\Users\ahmed\Documents\Codex\2026-07-13\i-n\work\runtime\node-v24.18.0-win-x64"
$env:PATH = "$nodeDir;$env:PATH"
& "$nodeDir\npm.cmd" test -- --run src/test/github-pages-hosting.test.ts
```

Expected: FAIL in `pre-renders every fixed clinic portal route`, beginning with `missing GitHub Pages route: clinic/queue`.

- [ ] **Step 3: Add every fixed clinic route to the Pages artifact**

In `.github/workflows/deploy-pages.yml`, replace the final:

```yaml
            staff
            clinic
            admin
```

with:

```yaml
            staff
            clinic
            clinic/queue
            clinic/appointments
            clinic/video-calls
            clinic/patients
            clinic/consultation
            clinic/dispensary
            clinic/procurement
            clinic/procurement-dashboard
            clinic/seasonal-forecast
            clinic/billings
            clinic/panel-claims
            clinic/receivables
            clinic/inventory
            clinic/inventory/restock-review
            clinic/owe-slips
            clinic/insight
            clinic/settings
            clinic/settings/clinic-profile
            clinic/settings/preferences
            clinic/settings/users
            clinic/settings/locum-registration
            clinic/settings/inventory
            clinic/settings/diagnoses
            clinic/settings/panels
            clinic/settings/drug-label
            clinic/settings/documents
            clinic/settings/document-templates
            clinic/settings/charges
            clinic/settings/queue
            clinic/settings/procurement-rules
            clinic/voided
            admin
```

- [ ] **Step 4: Add representative artifact assertions**

In the same workflow, immediately after:

```bash
          test -f dist/editor/index.html
```

insert:

```bash
          test -f dist/clinic/queue/index.html
          test -f dist/clinic/appointments/index.html
          test -f dist/clinic/inventory/restock-review/index.html
          test -f dist/clinic/settings/index.html
          test -f dist/clinic/settings/document-templates/index.html
          test -f dist/clinic/voided/index.html
```

- [ ] **Step 5: Run the focused test and confirm the fix**

Run:

```powershell
& "$nodeDir\npm.cmd" test -- --run src/test/github-pages-hosting.test.ts
```

Expected: PASS, 5 tests in `src/test/github-pages-hosting.test.ts`.

- [ ] **Step 6: Inspect the change boundary**

Run:

```powershell
git diff --check
git diff -- .github/workflows/deploy-pages.yml src/test/github-pages-hosting.test.ts
git status --short
```

Expected:

```text
 M .github/workflows/deploy-pages.yml
 M src/test/github-pages-hosting.test.ts
```

The previously committed specification and plan may appear in commit history, but no additional application, dependency, database, secret, or generated files may appear in the working-tree diff.

- [ ] **Step 7: Commit the tested route fix**

Run:

```powershell
git add .github/workflows/deploy-pages.yml src/test/github-pages-hosting.test.ts
git commit -m "fix: pre-render clinic portal routes on Pages"
```

Expected: one commit containing exactly the workflow and hosting-test changes.

### Task 2: Run complete local validation

**Files:**
- Verify: `.github/workflows/deploy-pages.yml`
- Verify: `src/test/github-pages-hosting.test.ts`
- Verify unchanged: `src/App.tsx`
- Verify unchanged: `src/components/ClinicProtectedRoute.tsx`
- Verify unchanged: `src/pages/Auth.tsx`

**Interfaces:**
- Consumes: the committed clinic route-generation change from Task 1.
- Produces: validation evidence suitable for pull-request review.

- [ ] **Step 1: Run changed-file linting**

Run:

```powershell
& "$nodeDir\npm.cmd" run lint:changed
```

Expected: exit code 0.

- [ ] **Step 2: Run TypeScript validation**

Run:

```powershell
& "$nodeDir\npx.cmd" tsc --noEmit
```

Expected: exit code 0 and no TypeScript errors.

- [ ] **Step 3: Run the complete frontend test suite**

Run:

```powershell
& "$nodeDir\npm.cmd" test
```

Expected: all test files pass; no failed tests.

- [ ] **Step 4: Run the Edge Function regression suites used by CI**

Run:

```powershell
$deno = "C:\Users\ahmed\Documents\Codex\2026-07-13\i-n\work\runtime\deno-v1.46.3\deno.exe"
& $deno test supabase/functions/_shared/secure-random_test.ts
& $deno test --allow-net --allow-env supabase/functions/tests/ai.test.ts
& $deno test supabase/functions/publish-scheduled-content/index_test.ts
```

Expected: all three commands exit 0.

- [ ] **Step 5: Run production and development builds**

Run:

```powershell
& "$nodeDir\npm.cmd" run build
& "$nodeDir\npm.cmd" run build:dev
```

Expected: both builds exit 0. The existing chunk-size warning and development-mode missing-variable warning are acceptable; new errors are not.

- [ ] **Step 6: Verify private files and generated output remain untracked**

Run:

```powershell
$privateFiles = git ls-files | Where-Object {
  (($_ -match '(^|/)\.env($|\.)') -and ($_ -notmatch '\.example$')) -or
  ($_ -match '(^|/)(node_modules|dist)/')
}
if ($privateFiles) {
  $privateFiles
  throw "Private or generated files are tracked."
}
git status --short
```

Expected: no private/generated paths are printed and the working tree is clean.

- [ ] **Step 7: Verify protected routing source was not modified**

Run:

```powershell
git diff origin/main...HEAD --name-only
```

Expected committed paths:

```text
.github/workflows/deploy-pages.yml
docs/superpowers/plans/2026-07-23-clinic-pages-deep-links.md
docs/superpowers/specs/2026-07-23-clinic-pages-deep-links-design.md
src/test/github-pages-hosting.test.ts
```

`src/App.tsx`, `src/components/ClinicProtectedRoute.tsx`, and `src/pages/Auth.tsx` must not appear.

### Task 3: Pull request, gated deployment, and read-only production verification

**Files:**
- Deliver: commits on `fix/clinic-pages-deep-links`
- Validate remotely: `.github/workflows/security-gate.yml`
- Deploy remotely: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: the clean, validated branch from Task 2.
- Produces: a GitHub pull request, a successful Security Gate, a successful Pages deployment, and production HTTP/browser evidence.

- [ ] **Step 1: Push the dedicated branch**

Run:

```powershell
git push -u origin fix/clinic-pages-deep-links
```

Expected: the remote branch is created successfully.

- [ ] **Step 2: Open the pull request**

Run:

```powershell
gh pr create `
  --base main `
  --head fix/clinic-pages-deep-links `
  --title "Fix direct clinic portal routes on GitHub Pages" `
  --body "## Summary`n- pre-render every fixed clinic portal route in the Pages artifact`n- add regression coverage for all 32 fixed clinic routes`n- preserve existing authentication, authorization, Supabase, and dynamic-route fallback behavior`n`n## Validation`n- hosting regression test`n- full Vitest suite`n- TypeScript`n- production and development builds`n- Deno Edge Function regression suites"
```

Expected: GitHub returns the new pull-request URL.

- [ ] **Step 3: Wait for the Security Gate**

Run:

```powershell
gh pr checks --watch
```

Expected: `security-and-type-check` succeeds. Do not merge a failing check.

- [ ] **Step 4: Review the remote diff**

Run:

```powershell
gh pr diff
```

Expected: only the two documentation files, deployment workflow, and hosting regression test are present. There must be no Supabase migration, application route, Auth, secret, dependency, lockfile, or clinic-data change.

- [ ] **Step 5: Merge only the reviewed, green pull request**

Run after the pull request is green and approved:

```powershell
gh pr merge --squash --delete-branch
```

Expected: the pull request is squash-merged into `main`.

- [ ] **Step 6: Wait for the Pages deployment**

Run:

```powershell
$runId = gh run list `
  --workflow "Deploy GitHub Pages" `
  --branch main `
  --limit 1 `
  --json databaseId `
  --jq '.[0].databaseId'
gh run watch $runId
```

Expected: the deployment concludes successfully for the merge commit.

- [ ] **Step 7: Verify HTTP 200 across all fixed clinic routes**

Run from PowerShell:

```powershell
$fixedRoutes = @(
  "clinic",
  "clinic/queue",
  "clinic/appointments",
  "clinic/video-calls",
  "clinic/patients",
  "clinic/consultation",
  "clinic/dispensary",
  "clinic/procurement",
  "clinic/procurement-dashboard",
  "clinic/seasonal-forecast",
  "clinic/billings",
  "clinic/panel-claims",
  "clinic/receivables",
  "clinic/inventory",
  "clinic/inventory/restock-review",
  "clinic/owe-slips",
  "clinic/insight",
  "clinic/settings",
  "clinic/settings/clinic-profile",
  "clinic/settings/preferences",
  "clinic/settings/users",
  "clinic/settings/locum-registration",
  "clinic/settings/inventory",
  "clinic/settings/diagnoses",
  "clinic/settings/panels",
  "clinic/settings/drug-label",
  "clinic/settings/documents",
  "clinic/settings/document-templates",
  "clinic/settings/charges",
  "clinic/settings/queue",
  "clinic/settings/procurement-rules",
  "clinic/voided"
)

foreach ($route in $fixedRoutes) {
  $status = curl.exe -sS -o NUL -w "%{http_code}" "https://klinikawfa.com/$route"
  if ($status -ne "200") {
    throw "Expected HTTP 200 for /$route; received $status"
  }
}
```

Expected: no exception; all 32 fixed routes return HTTP 200.

- [ ] **Step 8: Verify canonical-domain redirect**

Run:

```powershell
curl.exe -sS -I https://www.klinikawfa.com/clinic/queue
```

Expected: HTTP 301 with:

```text
Location: https://klinikawfa.com/clinic/queue
```

- [ ] **Step 9: Verify anonymous authentication behaviour in a browser**

Open `https://klinikawfa.com/clinic/queue` in a signed-out browser session.

Expected:

```text
https://klinikawfa.com/auth?redirect=%2Fclinic%2Fqueue
```

Confirm the login page renders and the browser console contains no new errors. Repeat with `/clinic/settings/document-templates` and confirm its complete encoded path is preserved. Do not submit the login form or any clinic form.

- [ ] **Step 10: Record the dynamic-route limitation**

Verify that the implementation did not attempt to enumerate queue-entry IDs. Record in the completion report that:

```text
/clinic/consultation/:queueEntryId
/clinic/queue/checkout/:queueEntryId
/clinic/visits/:queueEntryId
```

remain browser-functional through `dist/404.html`, but GitHub Pages may return HTTP 404 for their initial arbitrary-ID request.

- [ ] **Step 11: Produce the completion report**

Report:

- merge commit SHA;
- Security Gate run URL and result;
- Pages deployment run URL and result;
- 32/32 fixed clinic routes returning HTTP 200;
- canonical `www` redirect result;
- anonymous `/clinic/queue` redirect result;
- confirmation that no database, RLS, Auth, Edge Function, migration, secret, dependency, or production-data change occurred;
- the three documented dynamic-route limitations.
