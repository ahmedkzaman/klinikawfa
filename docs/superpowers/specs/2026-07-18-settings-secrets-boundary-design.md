# Settings and Secrets Boundary Design

## Goal

Remove Stripe credentials from every browser-readable database and UI path, and prevent non-finance clinic roles from reading clinic bank and SST fields without breaking operational clinic settings.

## Confirmed Risks

- `src/pages/admin/Settings.tsx` reads and writes `stripe_secret_key` and `stripe_restricted_key` through the browser.
- `supabase/functions/video-payment/index.ts` prefers a database Stripe key over the existing `STRIPE_SECRET_KEY` environment secret.
- `clinic_settings_clinic_roles_read` exposes `bank_name`, `bank_account_no`, `bank_account_holder`, and `sst_number` with every operational setting.
- The existing `STRIPE_SECRET_KEY` Lovable Cloud secret is already configured, so removing the database fallback does not require a replacement secret value.

## Design

### Stripe credentials

`video-payment` will read only `Deno.env.get("STRIPE_SECRET_KEY")` and fail closed when it is unavailable. The admin Settings page will no longer request, hold, reveal, save, or clear Stripe credentials. Its Stripe card will explain that credentials are managed in Lovable Cloud Secrets and will contain no credential input.

A forward-only migration will delete the obsolete `stripe_secret_key` and `stripe_restricted_key` rows from `app_settings`, then add a check constraint that rejects those keys in future inserts or updates. The migration will never contain or log a secret value.

### Clinic settings

Direct `SELECT` on `clinic_settings` will be finance-admin-only via `public.is_finance_admin()`. A `SECURITY DEFINER` RPC, `get_clinic_settings()`, will be the read boundary for the application:

- authenticated clinic roles may call it;
- finance admins receive the complete singleton row;
- all other clinic roles receive the operational row with `bank_name`, `bank_account_no`, `bank_account_holder`, and `sst_number` set to `NULL`;
- anonymous execution is revoked;
- the function uses an empty `search_path` and schema-qualified references.

`useClinicSettings()` will read through this RPC. Existing consumers keep the same `ClinicSettings` shape, so queue display, labels, receipts, forecasts, and profile settings continue working. Non-finance documents simply omit the already-optional bank/SST blocks. Existing update policies remain authoritative and are not broadened.

## Alternatives Rejected

1. **Mask Stripe keys in the UI:** rejected because the complete value still reaches browser memory.
2. **Keep encrypted Stripe keys in `app_settings`:** rejected because client-readable storage and key-management complexity remain unnecessary while Cloud Secrets already exists.
3. **Make `clinic_settings` finance-only without an RPC:** rejected because it would break operational settings for staff, locums, and residents.
4. **Return a second partial DTO and refactor every consumer:** safe but unnecessarily disruptive; the role-conditioned singleton RPC preserves the existing interface while enforcing the boundary server-side.

## Migration Safety

- The migration starts with preflight checks for the exact currently approved clinic-settings policy and required helper functions.
- Policy and function changes run in one transaction.
- Postflight checks require the exact final policy, deny anonymous RPC execution, require authenticated execution, and verify the forbidden Stripe-key constraint.
- Deleting only the two obsolete secret-key rows is intentional and forward-only. Rollback must not recreate secrets in a browser-readable table.

## Testing

- Static regression tests verify the migration policy, RPC grants, redaction fields, empty search path, exact deletion scope, and future-insert constraint.
- Source regression tests verify that the browser no longer references either Stripe database key and that `video-payment` no longer queries `app_settings`.
- Client tests verify `useClinicSettings()` calls `get_clinic_settings` instead of selecting the table directly.
- Existing TypeScript, Vitest, Deno, lint, production build, development build, and dependency audit gates must pass.
- Sanitized-staging validation must confirm the role matrix before production application.

## Non-Goals

- No clinic content, routes, pricing, medical records, invoices, or insurer data are changed.
- No Stripe secret value is read, copied, rotated, or displayed.
- No publishing occurs until the fresh post-migration security scan has no unresolved critical/error blockers.
