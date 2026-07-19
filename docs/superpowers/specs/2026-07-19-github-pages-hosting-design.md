# Klinik Awfa GitHub Pages Hosting Design

**Date:** 2026-07-19
**Status:** Approved design; implementation not yet started

## Objective

Move `klinikawfa.com` from its frozen Lovable deployment to free GitHub Pages hosting so an approved merge to `main` can publish automatically after the repository Security Gate passes.

The change must preserve the current React application, Supabase backend, public content, routes, secrets policy, and security checks.

## Current State

- `klinikawfa.com` is still served by a frozen Lovable CDN deployment.
- Hostinger manages the domain and DNS only; there is no Hostinger web-hosting plan.
- GitHub `main` contains the current application, including the approved homepage clinic-photo background.
- `.github/workflows/security-gate.yml` validates changes but does not deploy them.
- Supabase remains the production database, authentication, storage, and Edge Functions provider.

## Selected Approach

Use GitHub Pages with a GitHub Actions deployment workflow.

Alternatives considered:

1. **Cloudflare Pages:** strong SPA hosting, but requires another service account and deployment integration.
2. **Hostinger Web Hosting:** supports ordinary static hosting, but adds a recurring hosting charge.
3. **GitHub Pages (selected):** free, uses the existing repository and GitHub account, and can deploy automatically after the existing Security Gate succeeds.

## Architecture

```text
Merge to main
    -> Security Gate workflow
        -> success only
            -> GitHub Pages deployment workflow
                -> npm ci
                -> production Vite build
                -> Pages artifact
                -> GitHub Pages CDN
                    -> klinikawfa.com
                        -> existing Supabase backend
```

GitHub Pages hosts only the public frontend bundle. It does not receive database credentials, service-role keys, production data, or server-side responsibilities.

## Deployment Workflow

Add a dedicated workflow under `.github/workflows/` with these properties:

- Runs after the `Security Gate` workflow completes successfully for `main`.
- Supports a manual dispatch for controlled recovery or first-time setup.
- Never deploys a pull-request head directly.
- Checks out the exact successful `main` commit.
- Uses the repository's supported Node version and `npm ci`.
- Builds with `npm run build`.
- Supplies only these existing frontend build variables from GitHub Actions secrets:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
- Uploads only the generated `dist/` directory to GitHub Pages.
- Uses minimum permissions: repository contents read, Pages write, and OIDC token write.
- Uses deployment concurrency so a newer `main` deployment supersedes an older queued deployment without overlapping production writes.
- Pins third-party GitHub Actions to reviewed immutable commit SHAs, consistent with the repository's security workflow.

No `.env` file or secret value will be committed or included in the Pages artifact.

## Single-Page Application Routing

The application uses client-side routes. GitHub Pages does not provide configurable server rewrites, so the build artifact will include a `404.html` copy of the application entry page.

This fallback allows direct browser visits and refreshes on routes such as:

- `/services`
- `/services/rawatan-umum`
- `/doctors`
- `/appointment`
- `/auth`

React Router will read the original URL and render the correct page. Existing route names and page content remain unchanged.

## Custom Domain and DNS Cutover

The old Lovable record stays active until the GitHub Pages deployment is ready.

Cutover sequence:

1. Enable GitHub Pages with **GitHub Actions** as the source.
2. Configure `klinikawfa.com` as the repository's custom domain before changing DNS.
3. Deploy the validated Pages artifact.
4. In Hostinger DNS, remove the old Lovable apex A record `185.158.133.1`.
5. Add the four GitHub Pages apex A records:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
6. Configure `www` as a CNAME to `ahmedkzaman.github.io`.
7. Wait for GitHub's DNS check and certificate provisioning.
8. Enable **Enforce HTTPS** only after GitHub confirms the certificate is ready.

During DNS propagation, some visitors may briefly reach the old Lovable deployment while others reach GitHub Pages. No database migration or Supabase change is involved.

## Validation

Before DNS changes:

- Security Gate passes on the hosting PR.
- Production build succeeds with the three required frontend variables present by name.
- The Pages deployment job succeeds and publishes the intended commit.
- The artifact contains `index.html`, `404.html`, the clinic-background WebP asset, JavaScript, and CSS.
- The artifact contains no `.env`, service-role key, database password, or source map containing secrets.

After DNS changes:

- `klinikawfa.com` resolves to GitHub Pages rather than `185.158.133.1`.
- HTTPS is valid with no certificate warning.
- The homepage displays the clinic-photo hero background.
- Desktop and mobile layouts load without console errors or horizontal overflow.
- Direct navigation and refresh work on the public routes listed above.
- Public Supabase-backed service data loads.
- Authentication page loads; no real login or production-data mutation is required for the deployment check.
- Response assets match the new Pages deployment rather than the old Lovable bundle.

## Rollback

Before DNS cutover, rollback requires no public action because the old Lovable site remains live.

After DNS cutover, use either of these paths:

1. **Hosting rollback:** redeploy the last known-good GitHub commit through the manual Pages workflow.
2. **Emergency DNS rollback:** restore the apex A record `185.158.133.1` and remove the GitHub Pages A records while the Pages issue is investigated.

DNS rollback is an emergency bridge only; the long-term source of truth remains the validated GitHub repository.

## Non-Goals

- No public wording, route, component, styling, or UX change.
- No Supabase schema, RLS, migration, secret, Edge Function, or production-data change.
- No Hostinger hosting purchase.
- No reactivation or modification of the unavailable Lovable project.
- No automatic deployment from pull requests or failed Security Gate runs.

## Acceptance Criteria

The work is complete when:

1. The deployment workflow is merged and its Security Gate passes.
2. GitHub Pages successfully deploys the exact validated `main` commit.
3. Hostinger DNS points `klinikawfa.com` to GitHub Pages.
4. GitHub provides a valid HTTPS certificate for the custom domain.
5. The live homepage shows the new clinic-photo background.
6. The listed direct routes and Supabase-backed public reads work.
7. No private environment file or sensitive credential is present in Git or the deployed artifact.
