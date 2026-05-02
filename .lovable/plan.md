## Patch ERP RLS Policies

Apply a single SQL migration to relax RLS on the Phase 2C ERP tables so any authenticated user can perform CRUD operations (matching the pattern used elsewhere in the clinic module). This fixes silent failures when staff try to log Vendor Invoices, save Packages, or perform Stock Takes.

### Migration: `patch_erp_rls.sql`

Tables affected:
1. **`vendor_invoices`** — drop ops-only INSERT/UPDATE/DELETE policies, replace with `authenticated` policies (`true` / `true`).
2. **`clinic_packages`** — same swap.
3. **`clinic_package_items`** — same swap.
4. **`inventory_adjustments`** — drop ops-only INSERT, replace with `authenticated` INSERT requiring `adjusted_by = auth.uid()` (preserves audit integrity).

SELECT policies are left untouched (already permissive for authenticated users).

### Notes

- No application code changes required — hooks and UI already issue the correct mutations; they were just being blocked by RLS.
- After the migration applies successfully, I will stop and confirm before any further work.

### Security consideration

Opening write access to all authenticated users is consistent with how other clinic ERP tables (POs, suppliers, inventory) are scoped in this project. The `inventory_adjustments` audit table keeps the `adjusted_by = auth.uid()` check so users cannot forge audit log ownership.
