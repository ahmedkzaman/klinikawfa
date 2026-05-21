## Fix Silent Failures on Consultation Item Edits

### Root cause
The current RLS policies on `consultation_items` (UPDATE/INSERT) only allow `is_ops_or_admin(...) OR locum` — which excludes the `staff` role (nurses/front desk/dispensary). When a nurse edits a doctor-added row, PostgREST returns `0 rows updated` with **no error**, and our hook silently treats it as success.

Current policies:
```
INSERT  WITH CHECK (is_ops_or_admin OR locum)
UPDATE  USING/CHECK  (is_ops_or_admin OR locum)  + deleted_at IS NULL
SELECT  (deleted_at IS NULL)
DELETE  — no explicit policy (soft-delete via UPDATE)
```

The `is_staff_or_admin` helper already covers the right set: `admin, staff, special_admin, doctor_admin, operations, locum, resident_doctor`.

---

### 1. Database migration — widen RLS to clinical staff

Drop and recreate INSERT + UPDATE policies on `public.consultation_items` to use `is_staff_or_admin(auth.uid())` instead of `is_ops_or_admin OR locum`. This lets nurses/dispensary edit rows created by doctors while keeping the clinic-only boundary (only roles in our user_roles table).

```sql
DROP POLICY IF EXISTS consultation_items_ops_insert        ON public.consultation_items;
DROP POLICY IF EXISTS consultation_items_update_active     ON public.consultation_items;

CREATE POLICY consultation_items_staff_insert
  ON public.consultation_items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY consultation_items_staff_update_active
  ON public.consultation_items FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));
```

Notes:
- SELECT policies untouched (active rows visible to all authenticated; voided rows restricted to `special_admin`).
- No DELETE policy needed — soft-delete already runs through UPDATE and will be covered.

---

### 2. Harden `useConsultationItems.ts` — no more silent zero-row writes

For both `useUpdateConsultationItem` and `useUpdateDispensedQty`, replace the bare `.update(...).eq('id', id)` chain with `.update(...).eq('id', id).select('id').maybeSingle()` and throw when the result is `null`.

```ts
const { data, error } = await supabase
  .from('consultation_items')
  .update(updates)
  .eq('id', id)
  .select('id')
  .maybeSingle();
if (error) { /* existing stock-error handling */ throw error; }
if (!data) throw new Error('Permission denied or item not found.');
```

Also apply the same `.select('id').maybeSingle()` + null-throw guard to `useRemoveConsultationItem` (the soft-delete UPDATE) so deletes can't fail silently either.

`onSuccess` already invalidates `['consultation_items', consultationId]` — keep as-is.

---

### 3. Stop error-swallowing in callers

- **`EditInstructionsDialog.tsx`** — already has try/catch and only closes on success; no change needed beyond the hook now throwing a real error.
- **`VisitDetailsColumn.tsx` `handleQty` / `handleRemove`** — already wrapped in try/catch with `toast.error`. Add a `toast.success('Quantity updated')` on the qty path so successful edits give visible confirmation (currently silent on success too).
- **`ConsultationDetail.tsx` line ~974** — verify the `updateItem.mutateAsync` call there is also wrapped in try/catch; add one if missing so RLS/validation errors surface as a toast.

No UI/layout changes beyond the toast additions above.

---

### Out of scope
- No changes to SELECT/DELETE policies, to `consultations`, or to inventory triggers.
- No changes to add-item flow (already raises errors correctly).
- No role model changes — we reuse the existing `is_staff_or_admin` helper.