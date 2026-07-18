# Settings and Secrets Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Stripe credentials from browser-readable storage and restrict clinic bank/SST fields to finance admins while preserving operational clinic settings.

**Architecture:** A forward-only transactional migration makes direct clinic-settings reads finance-only, exposes a role-conditioned safe RPC, deletes obsolete Stripe-key rows, and prevents their return. The React hook reads through the RPC, the admin UI stops handling credentials, and `video-payment` uses only the existing Cloud secret.

**Tech Stack:** PostgreSQL/RLS, Supabase RPC and Edge Functions, React 18, TypeScript, TanStack Query, Vitest, Deno.

## Global Constraints

- Do not read, print, copy, rotate, or commit any secret value.
- Do not change clinic content, routes, prices, medical records, invoices, insurer rows, or public wording outside the security-settings card.
- Keep `save_client_invoice_items` and the insurer finance boundary unchanged.
- Run migration validation in sanitized staging before production.
- Do not publish until a fresh production security scan has no unresolved critical/error blocker.

---

### Task 1: Add failing source and migration regression tests

**Files:**
- Create: `src/test/settings-secrets-boundary.test.ts`
- Test: `src/test/settings-secrets-boundary.test.ts`

**Interfaces:**
- Consumes: the planned migration file, `Settings.tsx`, `useClinicSettings.ts`, and `video-payment/index.ts` as text.
- Produces: executable regression requirements for all later tasks.

- [ ] **Step 1: Write the failing test**

Create tests that read the four source artifacts and assert:

```ts
expect(migration).toContain('CREATE POLICY "clinic_settings_finance_admin_read"');
expect(migration).toContain('USING (public.is_finance_admin());');
expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_clinic_settings()');
expect(migration).toContain("jsonb_build_object(");
for (const field of ['bank_name', 'bank_account_no', 'bank_account_holder', 'sst_number']) {
  expect(migration).toContain(`'${field}', NULL`);
}
expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_clinic_settings() FROM anon;');
expect(migration).toContain("DELETE FROM public.app_settings\nWHERE key IN ('stripe_secret_key', 'stripe_restricted_key');");
expect(migration).toContain('app_settings_forbid_browser_secrets');
expect(settingsPage).not.toMatch(/stripe_(?:secret|restricted)_key/);
expect(videoPayment).not.toContain('.from("app_settings")');
expect(videoPayment).toContain('Deno.env.get("STRIPE_SECRET_KEY")');
expect(clinicHook).toContain("supabase.rpc('get_clinic_settings')");
expect(clinicHook).not.toContain(".from('clinic_settings' as never)\n        .select('*')");
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```powershell
node.exe node_modules/vitest/vitest.mjs run src/test/settings-secrets-boundary.test.ts --reporter=verbose --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the migration and RPC do not yet exist and the old browser/edge paths remain.

- [ ] **Step 3: Commit only after later tasks turn the test green**

The test belongs in the implementation commit so the branch never records an intentionally red final state.

### Task 2: Implement the database boundary and safe clinic-settings RPC

**Files:**
- Create: `supabase/migrations/20260718130000_harden_settings_secrets_boundary.sql`
- Modify: `src/hooks/clinic/useClinicSettings.ts`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/settings-secrets-boundary.test.ts`

**Interfaces:**
- Consumes: `public.is_finance_admin()`, `public.is_staff_or_clinical(uuid)`, the current `clinic_settings_clinic_roles_read` policy, and the singleton `clinic_settings` row.
- Produces: `public.get_clinic_settings()` returning `SETOF public.clinic_settings` with finance fields redacted for non-finance clinic roles.

- [ ] **Step 1: Write the transactional migration**

The migration must:

1. preflight the exact current clinic-settings SELECT policy;
2. replace it with `clinic_settings_finance_admin_read` using `public.is_finance_admin()`;
3. create `get_clinic_settings()` as `STABLE SECURITY DEFINER SET search_path = ''`;
4. reject unauthenticated/non-clinic callers;
5. return the complete row to finance admins and `jsonb_populate_record` with the four finance fields set to JSON null for other clinic roles;
6. revoke `PUBLIC` and `anon`, grant `authenticated`;
7. delete only the two Stripe-key rows;
8. add `app_settings_forbid_browser_secrets` rejecting those exact keys;
9. postflight the policy inventory, function grants/config, constraint, and absence of forbidden rows;
10. commit atomically.

- [ ] **Step 2: Route the client hook through the RPC**

Replace the query body with:

```ts
const { data, error } = await supabase.rpc('get_clinic_settings');
if (error) throw error;
return ((data?.[0] as ClinicSettings | undefined) ?? DEFAULTS);
```

Do not change update/upload behavior or the `ClinicSettings` public interface.

- [ ] **Step 3: Add the generated RPC type**

Add under `Database['public']['Functions']`:

```ts
get_clinic_settings: {
  Args: never
  Returns: Database['public']['Tables']['clinic_settings']['Row'][]
}
```

- [ ] **Step 4: Run the targeted test**

Expected: database/hook assertions pass; Stripe source assertions remain red until Task 3.

### Task 3: Remove Stripe credentials from browser and database fallback paths

**Files:**
- Modify: `src/pages/admin/Settings.tsx`
- Modify: `supabase/functions/video-payment/index.ts`
- Test: `src/test/settings-secrets-boundary.test.ts`

**Interfaces:**
- Consumes: existing `STRIPE_SECRET_KEY` Edge Function environment secret.
- Produces: payment initialization that fails closed without the Cloud secret and an admin settings card with no secret value/input.

- [ ] **Step 1: Remove secret state and database queries from Settings**

Remove `StripeKeyState`, both key states, key parsing from `fetchSettings`, `saveKey`, `clearKey`, `maskKey`, and `KeyInput`. Keep homepage video behavior intact. Limit the initial `app_settings` query to `homepage_video_url` and `homepage_video_poster`.

- [ ] **Step 2: Replace the Stripe card with a non-secret status notice**

Keep the existing admin-only Stripe card, but show only that Stripe credentials are managed in Lovable Cloud Secrets and never loaded into the browser. Do not provide a field, reveal control, save action, or displayed secret status derived from a value.

- [ ] **Step 3: Remove the database fallback from `video-payment`**

Use:

```ts
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
if (!stripeSecretKey) {
  return new Response(JSON.stringify({ error: "Stripe API key not configured" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 500,
  });
}
```

Retain all authentication, authorization, checkout, CORS, and Stripe business logic unchanged.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Expected: all settings/secrets boundary tests pass.

- [ ] **Step 5: Run the complete frontend suite**

Expected: 35 existing tests plus the new tests pass.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/test/settings-secrets-boundary.test.ts src/hooks/clinic/useClinicSettings.ts src/integrations/supabase/types.ts src/pages/admin/Settings.tsx supabase/functions/video-payment/index.ts supabase/migrations/20260718130000_harden_settings_secrets_boundary.sql
git commit -m "fix: harden settings and Stripe secrets"
```

### Task 4: Validate, stage, review, and integrate

**Files:**
- Modify only if validation exposes a defect in the files listed above.

**Interfaces:**
- Consumes: completed branch and sanitized staging database.
- Produces: evidence suitable for production approval and a GitHub pull request.

- [ ] **Step 1: Run local gates**

Run changed-file lint, TypeScript, full Vitest, both Deno suites, production build, development build, dependency audit against the public registry, and private-file scan.

- [ ] **Step 2: Apply to sanitized staging**

Take an external rollback snapshot, apply the migration transaction, and verify:

- finance roles receive full clinic settings;
- staff, locum, and resident roles receive the row with four null finance fields;
- guest/anonymous callers cannot execute;
- forbidden Stripe rows are absent and cannot be inserted;
- `video-payment` tests pass without a database key path.

- [ ] **Step 3: Push and open a draft PR**

Push `agent/harden-settings-secrets`, open a draft PR to `main`, and wait for Security Gate.

- [ ] **Step 4: Merge only after review and green CI**

Squash merge when the diff, CI, and staging evidence are clean.

- [ ] **Step 5: Apply production migration and redeploy only `video-payment`**

Take a production pre-state snapshot outside the repository. Apply the exact reviewed migration transaction and deploy only the changed Edge Function. Run postflight verification without reading any secret value.

- [ ] **Step 6: Run a fresh deep security scan**

Demonstrably stale invoice and insurer findings may be closed with attached postflight evidence. Do not ignore a finding that is not disproved. Publish only if no unresolved critical/error blocker remains.
