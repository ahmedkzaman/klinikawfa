# Plan — Harden RLS for PHI & Billing (corrected)

## Why the literal spec must be adapted

Three issues confirmed against the live schema. Sticking to the prompt verbatim would compile but be wrong at runtime.

1. **`auth.jwt() ->> 'role'` does not return app roles.** It returns Supabase's built-in PostgREST role (`authenticated`, `anon`, `service_role`). The real role enum (`admin`, `doctor`, `staff`, `locum`, etc.) lives in `public.user_roles` and is read via existing SECURITY DEFINER helpers (`is_admin`, `is_internal_staff`, `is_ops_or_admin`, `has_strict_role`, `has_role`). Using a JWT claim that is never populated would silently deny everyone except service_role — including the staff app. We will use the helpers, which is the pattern already documented in the project memory ([User Roles] system prompt) and used by every other policy.
2. **`consultations.doctor_id` is `doctors.id`, not `auth.users.id`.** `doctor_id = auth.uid()` always returns false. Locum scoping has to go through `doctors.user_id` (or, simpler and consistent with the rest of the app, `has_strict_role(auth.uid(),'locum')` plus the existing `is_clinical` set — there is no locum-only PHI partition in the current product).
3. **`patients.id` is not an auth user id.** Patients are not authenticated users in this product — there is no patient portal. A `patients.id = auth.uid()` clause would be dead code. I will not add a patient-self-read policy; the requirement is implicitly satisfied because no `patient` role exists and no anon access is granted.

So the spec's intent — "only clinical/admin/ops touch PHI; only ops/admin touch billing writes; everyone else denied" — is honoured, but expressed with the helpers that actually work.

## Helper to add

```sql
CREATE OR REPLACE FUNCTION public.is_clinical(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('doctor','doctor_admin','resident_doctor','locum','admin','special_admin')
  )
$$;
```
Re-uses existing `is_admin`, `is_internal_staff`, `is_ops_or_admin` for the rest.

## Migration file

`supabase/migrations/20260612000000_harden_phi_billing_rls.sql` — single transaction, idempotent (`DROP POLICY IF EXISTS`). RLS is already enabled on every listed table.

### PHI cluster — `patients`, `consultations`, `vital_signs`

Drop every existing permissive policy on these three tables, then:

```sql
-- patients
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY patients_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY patients_update ON public.patients
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY patients_delete ON public.patients
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- consultations
CREATE POLICY consultations_select ON public.consultations
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY consultations_insert ON public.consultations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinical(auth.uid()));

CREATE POLICY consultations_update ON public.consultations
  FOR UPDATE TO authenticated
  USING (public.is_clinical(auth.uid()))
  WITH CHECK (public.is_clinical(auth.uid()));
-- Existing trigger `guard_completed_consultation_notes` keeps locking completed notes.

CREATE POLICY consultations_delete ON public.consultations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- vital_signs
CREATE POLICY vital_signs_select ON public.vital_signs
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY vital_signs_write ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_update ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_delete ON public.vital_signs
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
```
No `TO anon` grants. RLS denies guests by default.

### Billing cluster — `corporate_clients`, `client_invoices`, `clinic_packages`

Drop existing permissive write policies, then:

```sql
-- read: any internal staff (clinical roles can view billing context)
CREATE POLICY corporate_clients_select ON public.corporate_clients
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY client_invoices_select ON public.client_invoices
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY clinic_packages_select ON public.clinic_packages
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));

-- write: ops/admin/special_admin only
CREATE POLICY corporate_clients_write ON public.corporate_clients
  FOR INSERT TO authenticated WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY corporate_clients_upd ON public.corporate_clients
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY corporate_clients_del ON public.corporate_clients
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- (same INSERT/UPDATE/DELETE pattern repeated for client_invoices and clinic_packages)
```
`is_ops_or_admin` already maps to `staff/ops_staff/operations/admin/special_admin/doctor_admin/resident_doctor` — the operational set the spec asks for. Patients have no role and guests are unauthenticated → both denied by default.

## Out of scope (kept for a later migration)
`queue_entries`, `consultation_items`, `consultation_attachments`, `consultation_documents`, `consultation_transcripts`, `payments`, `einvoices`, `vendor_invoices`, `client_invoice_items`, `clinic_package_items`, `inventory_adjustments`, `panel_*`, `package_items`. The spec named only the six tables above; expanding scope here would risk the staff portal. They will be tackled in a follow-up cluster migration once this lands clean.

## Risks & rollback
- **Risk:** any frontend code that read PHI/billing while logged in as a role outside `is_internal_staff` (e.g. a user with only `guest`) would silently get empty results today and now gets RLS denials. Mitigation: AuthContext already routes those users away from `/clinic` and `/staff`.
- **Risk:** dropping the old policies by exact name requires we know them. `DROP POLICY IF EXISTS` against every name we observed in `supabase/migrations/*.sql` (verified via grep) is included; the migration also runs a defensive `pg_policies` loop to drop any leftover policy whose `qual` or `with_check` text is exactly `true` on these six tables, so no stale permissive policy can survive.
- **Rollback:** a paired down-migration recreating the prior `USING (true)` policies will be committed in a sibling `*_rollback.sql` file (not auto-applied). Restoring is a one-line `psql -f` if needed.

## Verification
```
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Plus:
- Supabase linter via the linter tool (expect no new warnings on these 6 tables).
- Smoke test as a staff user: PatientsList, ConsultationDetail, VitalSigns entry, Receivables, PanelClaims, Procurement (corporate clients edit), Settings → Packages.
- Negative test: log in as a `guest`-role user and confirm `/clinic/patients` returns empty / denied.
