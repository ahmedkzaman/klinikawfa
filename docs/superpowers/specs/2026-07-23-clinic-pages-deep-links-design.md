# Clinic Portal GitHub Pages Deep-Link Design

## Objective

Make every fixed Klinik Awfa clinic-portal route safe to open directly, bookmark, and refresh on GitHub Pages without receiving an initial HTTP 404. Preserve the current React routing, authentication redirects, role permissions, Supabase project, database, and clinic data.

## Confirmed Root Cause

The React application still defines `/clinic/queue` and the queue feature remains intact. GitHub Pages serves only files that exist in the deployed artifact. The deployment currently creates `dist/clinic/index.html`, but it does not create `dist/clinic/queue/index.html` or the other fixed clinic-route entry files.

Consequently, a direct request to `/clinic/queue` receives the deployed SPA fallback with HTTP 404. React subsequently loads and correctly redirects a logged-out user to `/auth?redirect=%2Fclinic%2Fqueue`, but the initial hosting response is still incorrect.

## Selected Approach

Extend the existing static-route generation in `.github/workflows/deploy-pages.yml`. During deployment, copy the built `dist/index.html` into an `index.html` beneath every fixed clinic route.

This is the smallest approach that follows the repository's established GitHub Pages pattern. It introduces no client-side redirect shim and requires no hosting migration.

## Fixed Clinic Routes

The deployment artifact must contain entry files for these routes:

1. `clinic`
2. `clinic/queue`
3. `clinic/appointments`
4. `clinic/video-calls`
5. `clinic/patients`
6. `clinic/consultation`
7. `clinic/dispensary`
8. `clinic/procurement`
9. `clinic/procurement-dashboard`
10. `clinic/seasonal-forecast`
11. `clinic/billings`
12. `clinic/panel-claims`
13. `clinic/receivables`
14. `clinic/inventory`
15. `clinic/inventory/restock-review`
16. `clinic/owe-slips`
17. `clinic/insight`
18. `clinic/settings`
19. `clinic/settings/clinic-profile`
20. `clinic/settings/preferences`
21. `clinic/settings/users`
22. `clinic/settings/locum-registration`
23. `clinic/settings/inventory`
24. `clinic/settings/diagnoses`
25. `clinic/settings/panels`
26. `clinic/settings/drug-label`
27. `clinic/settings/documents`
28. `clinic/settings/document-templates`
29. `clinic/settings/charges`
30. `clinic/settings/queue`
31. `clinic/settings/procurement-rules`
32. `clinic/voided`

## Dynamic Clinic Routes

These routes contain database-generated queue-entry identifiers:

- `clinic/consultation/:queueEntryId`
- `clinic/queue/checkout/:queueEntryId`
- `clinic/visits/:queueEntryId`

GitHub Pages cannot create native HTTP-200 files for arbitrary future identifiers. These routes will retain the existing `dist/404.html` SPA fallback. They remain browser-functional because React reads the original path, applies authentication, and renders the matching route. Their initial server response may remain HTTP 404.

Solving native HTTP 200 for arbitrary identifiers would require either a custom path-encoding redirect layer or hosting that supports SPA rewrites. Both are intentionally outside this change.

## Authentication and Authorization

This change must not modify `src/App.tsx`, `ClinicProtectedRoute`, `Auth`, `AuthContext`, roles, permissions, or redirects.

Expected behaviour remains:

- Logged-out visitors are redirected to `/auth?redirect=<encoded-original-path>`.
- `website_editor` and `guest` users cannot enter the clinic portal.
- Clinic staff, operations users, locums, `doctor_admin`, `admin`, and `special_admin` retain their existing route-specific access.
- Access to clinical, operational, administrative, and insight routes continues to be enforced inside React after the static entry file loads.

The generated HTML files contain only the public frontend shell. They do not bypass client authorization or Supabase row-level security.

## Files and Responsibilities

### `.github/workflows/deploy-pages.yml`

Add all fixed clinic paths to the existing `routes` array. Retain the existing loop that creates the directory and copies `dist/index.html`.

Add artifact assertions for representative route depths:

- `dist/clinic/queue/index.html`
- `dist/clinic/appointments/index.html`
- `dist/clinic/inventory/restock-review/index.html`
- `dist/clinic/settings/index.html`
- `dist/clinic/settings/document-templates/index.html`
- `dist/clinic/voided/index.html`

### `src/test/github-pages-hosting.test.ts`

Add one regression test containing the complete expected fixed clinic-route list. For every route, assert that the workflow declares the route and that the workflow's existing artifact-generation loop remains present.

The test must fail against the current workflow because `clinic/queue` and the other fixed clinic paths are absent, then pass after the workflow change.

## Validation

### Local validation

Run:

1. The focused GitHub Pages hosting test.
2. The complete Vitest suite.
3. TypeScript validation.
4. Production build.
5. Development-mode build.
6. The repository's existing environment-file and secret-name checks through the Security Gate.

No Supabase connection, database write, form submission, migration, Edge Function deployment, or secret modification is required.

### Pull request validation

Push the dedicated branch and open a pull request. The Security Gate must complete successfully before merge. The GitHub Pages workflow must deploy the exact successful merge commit.

### Production validation

After deployment:

- `https://www.klinikawfa.com/clinic/queue` redirects to `https://klinikawfa.com/clinic/queue`.
- Every fixed clinic route returns HTTP 200 from GitHub Pages.
- Opening `/clinic/queue` while logged out ends at `/auth?redirect=%2Fclinic%2Fqueue`.
- Representative settings and nested routes preserve their exact redirect targets.
- No new browser console errors appear.
- No login form, clinic form, appointment form, or data-changing control is submitted during anonymous verification.

## Rollback

Rollback is a normal code revert of the workflow and its regression test. No data rollback is needed because the change creates only static deployment entry files and does not touch Supabase or production data.

## Success Criteria

The work is complete when all 32 fixed clinic paths have generated entry files, the automated route-coverage test passes, the Security Gate and Pages deployment succeed, anonymous production checks return HTTP 200 for fixed routes, and existing authentication redirects remain unchanged.
