# Klinik Awfa GitHub Pages Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the validated Klinik Awfa frontend automatically to GitHub Pages after the Security Gate passes, then move `klinikawfa.com` from the frozen Lovable deployment to the new Pages deployment.

**Architecture:** A deployment workflow listens for a successful `Security Gate` run on `main`, rebuilds the Vite application with the existing frontend-only Supabase secrets, validates the static artifact, and deploys it to GitHub Pages. Hostinger remains the DNS provider; the apex records move to GitHub Pages only after the Pages artifact succeeds.

**Tech Stack:** GitHub Actions, GitHub Pages, Node.js 24, npm 11, Vite 8, React 18, Vitest 3, React Router 6, Supabase

## Global Constraints

- Host only the generated public frontend bundle; Supabase remains the production database, authentication, storage, and Edge Functions provider.
- Deploy automatically only after the `Security Gate` succeeds for `main`.
- A manual deployment may target only `main` and must verify that the selected commit has a successful `security-and-type-check` check run.
- Use only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` during the frontend build.
- Never commit or deploy a private `.env`, Supabase service-role key, database password, payment secret, or source map containing secrets.
- Pin every GitHub Action to a reviewed immutable commit SHA.
- Preserve all public wording, routes, components, Supabase configuration, migrations, RLS, Edge Functions, and production data.
- Keep the old Lovable DNS record active until the GitHub Pages deployment succeeds.
- Do not enable HTTPS enforcement until GitHub confirms DNS and certificate readiness.

---

## File Structure

- Create `.github/workflows/deploy-pages.yml`: build validation and GitHub Pages deployment.
- Create `public/CNAME`: declare the production custom domain in the Vite artifact.
- Create `src/test/github-pages-hosting.test.ts`: regression checks for deployment gating, immutable action pins, frontend secret boundaries, SPA fallback, and custom domain.
- Existing application files remain unchanged.

### Task 1: Add a Failing Hosting-Workflow Regression Test

**Files:**
- Create: `src/test/github-pages-hosting.test.ts`

**Interfaces:**
- Consumes: repository files through Node `readFileSync`.
- Produces: regression coverage that the deployment workflow and custom-domain declaration must satisfy.

- [ ] **Step 1: Create the test**

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");
const workflowPath = resolve(repoRoot, ".github/workflows/deploy-pages.yml");
const cnamePath = resolve(repoRoot, "public/CNAME");

const readWorkflow = () => readFileSync(workflowPath, "utf8");

describe("GitHub Pages hosting", () => {
  it("deploys only successful Security Gate commits from main", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflows: ["Security Gate"]');
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("security-and-type-check");
    expect(workflow).not.toContain("pull_request:");
  });

  it("uses immutable reviewed action pins and least privilege", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain("actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0");
    expect(workflow).toContain("actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e");
    expect(workflow).toContain("actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d");
    expect(workflow).toContain("actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9");
    expect(workflow).toContain("actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("checks: read");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
  });

  it("builds with frontend-only Supabase variables and prepares the SPA artifact", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain("VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}");
    expect(workflow).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}");
    expect(workflow).toContain("run: npm run build");
    expect(workflow).toContain("cp dist/index.html dist/404.html");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("find dist -type f -name '*.map'");
    expect(workflow).toContain("path: ./dist");
  });

  it("declares the approved production domain", () => {
    expect(readFileSync(cnamePath, "utf8").trim()).toBe("klinikawfa.com");
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- src/test/github-pages-hosting.test.ts`

Expected: FAIL because `.github/workflows/deploy-pages.yml` and `public/CNAME` do not exist.

- [ ] **Step 3: Do not commit the red-only state**

Continue directly to Task 2 and commit only after the focused test passes.

### Task 2: Implement the Guarded GitHub Pages Workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `public/CNAME`
- Test: `src/test/github-pages-hosting.test.ts`

**Interfaces:**
- Consumes: successful `Security Gate` workflow runs, GitHub Actions frontend secrets, and `main` commit SHAs.
- Produces: a validated `dist/` Pages artifact and the `github-pages` environment deployment URL.

- [ ] **Step 1: Create `public/CNAME`**

```text
klinikawfa.com
```

- [ ] **Step 2: Create `.github/workflows/deploy-pages.yml`**

```yaml
name: Deploy GitHub Pages

"on":
  workflow_run:
    workflows: ["Security Gate"]
    branches: [main]
    types: [completed]
  workflow_dispatch:

permissions:
  contents: read
  checks: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  deploy:
    if: >-
      (github.event_name == 'workflow_run' &&
       github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.head_branch == 'main') ||
      (github.event_name == 'workflow_dispatch' &&
       github.ref == 'refs/heads/main')
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Resolve deploy commit
        id: commit
        env:
          WORKFLOW_SHA: ${{ github.event.workflow_run.head_sha }}
          DISPATCH_SHA: ${{ github.sha }}
        run: echo "sha=${WORKFLOW_SHA:-$DISPATCH_SHA}" >> "$GITHUB_OUTPUT"

      - name: Checkout validated commit
        # actions/checkout v7.0.0
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
        with:
          ref: ${{ steps.commit.outputs.sha }}
          fetch-depth: 1

      - name: Verify Security Gate result
        env:
          GH_TOKEN: ${{ github.token }}
          DEPLOY_SHA: ${{ steps.commit.outputs.sha }}
        run: |
          conclusion="$(gh api \
            -H "Accept: application/vnd.github+json" \
            "/repos/${GITHUB_REPOSITORY}/commits/${DEPLOY_SHA}/check-runs" \
            --jq '.check_runs[] | select(.name == "security-and-type-check") | .conclusion' \
            | head -n 1)"
          if [ "$conclusion" != "success" ]; then
            echo "Security Gate is not successful for ${DEPLOY_SHA}."
            exit 1
          fi

      - name: Setup Node.js
        # actions/setup-node v6.4.0
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "24"
          cache: "npm"

      - name: Configure GitHub Pages
        # actions/configure-pages v6.0.0
        uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d

      - name: Install dependencies
        run: npm ci

      - name: Build production site
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
        run: npm run build

      - name: Prepare and validate Pages artifact
        run: |
          cp dist/index.html dist/404.html
          test -f dist/index.html
          test -f dist/404.html
          test -f dist/CNAME
          test "$(cat dist/CNAME)" = "klinikawfa.com"
          test -n "$(find dist/assets -type f -name 'klinik-awfa-exterior-*.webp' -print -quit)"
          if find dist -type f -name '.env*' | grep -q .; then
            echo "Private environment file found in Pages artifact."
            exit 1
          fi
          if find dist -type f -name '*.map' | grep -q .; then
            echo "Source map found in Pages artifact."
            exit 1
          fi
          if grep -R -E \
            'SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET' \
            dist; then
            echo "Server-only secret name found in Pages artifact."
            exit 1
          fi

      - name: Upload Pages artifact
        # actions/upload-pages-artifact v5.0.0
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9
        with:
          path: ./dist

      - name: Deploy GitHub Pages
        id: deployment
        # actions/deploy-pages v5.0.0
        uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128
```

- [ ] **Step 3: Run the focused test to verify GREEN**

Run: `npm test -- src/test/github-pages-hosting.test.ts`

Expected: 4 tests pass.

- [ ] **Step 4: Run static checks**

```powershell
npx tsc --noEmit
npm run lint:changed
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-pages.yml public/CNAME src/test/github-pages-hosting.test.ts
git commit -m "Add guarded GitHub Pages deployment"
```

### Task 3: Validate the Complete Application and Artifact Locally

**Files:**
- Verify: `.github/workflows/deploy-pages.yml`
- Verify: `public/CNAME`
- Verify: `src/test/github-pages-hosting.test.ts`

**Interfaces:**
- Consumes: the completed workflow files and local frontend build variables.
- Produces: evidence that the hosting change does not regress the application and that the artifact contains only approved public files.

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`

Expected: every test file passes, including the four hosting tests.

- [ ] **Step 2: Run type and lint gates**

```powershell
npx tsc --noEmit
npm run lint:changed
```

Expected: both commands exit 0.

- [ ] **Step 3: Build production**

Run `npm run build` with these variable names present without printing values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Expected: Vite exits 0 and emits `dist/assets/klinik-awfa-exterior-*.webp`.

- [ ] **Step 4: Reproduce Pages artifact preparation**

```powershell
Copy-Item -LiteralPath dist/index.html -Destination dist/404.html
Test-Path -LiteralPath dist/index.html
Test-Path -LiteralPath dist/404.html
Test-Path -LiteralPath dist/CNAME
Get-ChildItem -LiteralPath dist/assets -Filter "klinik-awfa-exterior-*.webp"
```

Expected: all `Test-Path` calls return `True` and one clinic-background WebP is listed.

- [ ] **Step 5: Scan artifact and diff**

```powershell
Get-ChildItem -Path dist -Recurse -File -Filter ".env*"
Get-ChildItem -Path dist -Recurse -File -Filter "*.map"
git diff --check origin/main...HEAD
git status --short
```

Expected: no environment files or source maps, no diff errors, and a clean working tree.

### Task 4: Push a Review Branch and Validate GitHub

**Files:**
- Review: all files changed from `origin/main`.

**Interfaces:**
- Consumes: clean branch `agent/github-pages-hosting`.
- Produces: a pull request whose workflow syntax and Security Gate are evaluated by GitHub.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin agent/github-pages-hosting`

- [ ] **Step 2: Open the pull request**

Title: `Add guarded GitHub Pages deployment`

Body:

```text
Adds free GitHub Pages hosting for the existing Klinik Awfa frontend. Deployment is gated on a successful Security Gate run for main, uses only frontend Supabase build variables, validates the public artifact, preserves SPA direct routes, and does not change app content, Supabase, migrations, secrets, or production data. DNS remains unchanged until the Pages deployment succeeds.
```

- [ ] **Step 3: Wait for GitHub validation**

Run: `gh pr checks --repo ahmedkzaman/klinikawfa --watch`

Expected: `security-and-type-check` passes and GitHub reports no workflow-syntax annotation.

- [ ] **Step 4: Stop if any check fails**

Inspect the exact log, fix only the identified root cause, rerun local verification, and push a new commit. Never bypass or suppress the Security Gate.

### Task 5: Enable Pages Without Changing DNS

**Files:**
- No repository change.
- GitHub setting: Pages build type and custom domain.

**Interfaces:**
- Consumes: repository administrator access.
- Produces: an enabled Pages target; the old Lovable site remains public because DNS is unchanged.

- [ ] **Step 1: Inspect current Pages state**

Run: `gh api repos/ahmedkzaman/klinikawfa/pages`

Expected: current settings or a 404 if Pages is absent.

- [ ] **Step 2: Enable workflow hosting only if absent**

Run: `gh api --method POST repos/ahmedkzaman/klinikawfa/pages -f build_type=workflow`

Expected: Pages configuration. Skip this POST if Step 1 already returned settings.

- [ ] **Step 3: Set the domain without HTTPS enforcement**

```bash
gh api --method PUT repos/ahmedkzaman/klinikawfa/pages \
  -f build_type=workflow \
  -f cname=klinikawfa.com \
  -F https_enforced=false
```

Expected: GitHub records `klinikawfa.com`; DNS remains pending.

- [ ] **Step 4: Confirm the old public site remains live**

```powershell
(Invoke-WebRequest -Uri "https://klinikawfa.com" -UseBasicParsing).Headers["x-deployment-id"]
```

Expected: the old Lovable deployment ID is still returned.

### Task 6: Merge and Produce the First Pages Deployment

**Files:**
- No new local change.

**Interfaces:**
- Consumes: approved PR, successful Security Gate, and enabled Pages.
- Produces: a Pages deployment of the exact merged `main` commit.

- [ ] **Step 1: Squash and merge only after review approval**

Use GitHub's merge control. Never force-push or bypass checks.

- [ ] **Step 2: Monitor the main Security Gate**

Run: `gh run list --repo ahmedkzaman/klinikawfa --branch main --workflow security-gate.yml --limit 1`

Expected: the merged commit's Security Gate succeeds.

- [ ] **Step 3: Monitor Pages**

```bash
pages_run_id="$(gh run list \
  --repo ahmedkzaman/klinikawfa \
  --branch main \
  --workflow deploy-pages.yml \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"
test -n "$pages_run_id"
gh run watch "$pages_run_id" --repo ahmedkzaman/klinikawfa
```

Expected: `Deploy GitHub Pages` succeeds and reports a deployment URL.

- [ ] **Step 4: Confirm Pages metadata**

Run: `gh api repos/ahmedkzaman/klinikawfa/pages`

Expected: build type `workflow`, custom domain `klinikawfa.com`, and the intended commit. Do not change DNS otherwise.

### Task 7: Cut Over Hostinger DNS and Enable HTTPS

**Files:**
- No repository change.
- Hostinger DNS records.

**Interfaces:**
- Consumes: successful Pages deployment.
- Produces: production traffic to GitHub Pages with a valid certificate.

- [ ] **Step 1: Record rollback**

Keep outside the repository: `Old apex A record: 185.158.133.1`.

- [ ] **Step 2: Replace apex DNS**

In Hostinger DNS:

- Remove `@` A -> `185.158.133.1`.
- Add `@` A -> `185.199.108.153`.
- Add `@` A -> `185.199.109.153`.
- Add `@` A -> `185.199.110.153`.
- Add `@` A -> `185.199.111.153`.
- Use TTL 600 seconds during cutover.

- [ ] **Step 3: Configure www**

Remove conflicting `www` records, then add:

```text
Type: CNAME
Name: www
Target: ahmedkzaman.github.io
```

- [ ] **Step 4: Wait for DNS**

```powershell
Resolve-DnsName klinikawfa.com -Type A
Resolve-DnsName www.klinikawfa.com -Type CNAME
```

Expected: four `185.199.*.153` apex addresses and `www` -> `ahmedkzaman.github.io`.

- [ ] **Step 5: Wait for certificate readiness**

Run: `gh api repos/ahmedkzaman/klinikawfa/pages`

Expected: no custom-domain or certificate error.

- [ ] **Step 6: Enable HTTPS**

Run: `gh api --method PUT repos/ahmedkzaman/klinikawfa/pages -F https_enforced=true`

Expected: accepted. If GitHub reports DNS or certificate pending, wait and retry without changing other settings.

### Task 8: Verify Production and Preserve Rollback

**Files:**
- No repository change.

**Interfaces:**
- Consumes: propagated DNS and HTTPS.
- Produces: evidence that the domain serves the merged Pages build and public behavior remains intact.

- [ ] **Step 1: Confirm Lovable is no longer serving**

```powershell
$response = Invoke-WebRequest -Uri "https://klinikawfa.com" -UseBasicParsing
$response.StatusCode
$response.Headers["x-deployment-id"]
$response.Content
```

Expected: status 200, no Lovable `x-deployment-id`, and new Pages assets.

- [ ] **Step 2: Confirm the background asset**

Inspect live asset references and confirm `klinik-awfa-exterior-*.webp` returns HTTP 200.

- [ ] **Step 3: Run responsive checks**

At `1440x900` and `390x844`, verify the faint photo, readable copy and CTAs, visible mobile AWFA sign, no horizontal overflow, and no console errors.

- [ ] **Step 4: Test direct refreshes**

Open and refresh:

- `https://klinikawfa.com/services`
- `https://klinikawfa.com/services/rawatan-umum`
- `https://klinikawfa.com/doctors`
- `https://klinikawfa.com/appointment`
- `https://klinikawfa.com/auth`

Expected: React pages, not a GitHub 404 page.

- [ ] **Step 5: Verify public Supabase reads without mutation**

Confirm the services listing and one mapped detail page load existing content. Do not log in, submit forms, migrate, change secrets, or write production data.

- [ ] **Step 6: Roll back only for an acceptance failure**

Preferred: redeploy a previous known-good commit after confirming its Security Gate.

Emergency DNS rollback:

- remove the four GitHub Pages A records;
- restore `@` A -> `185.158.133.1`;
- keep the workflow and branch for diagnosis.

Do not roll back for ordinary cache delay; use rollback only for a broken site, invalid HTTPS, failed routes, or failed Supabase connectivity.
