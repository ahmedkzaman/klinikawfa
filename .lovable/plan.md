## Allow dispensary staff to edit/delete items during checkout

### Root cause
`DispenseCheckout` uses `useConsultationLock(consultation)` to derive `canEdit`. The doctor's pessimistic lock (`consultations.locked_by`) is still set after they finish — so when patient reaches `clinic_status = 'dispensing_payment'`, the dispensary user sees **VIEW ONLY** and every Edit/Remove/Print/Add control is disabled, even though RLS (`consultation_items_staff_update_active`) would happily accept the soft-delete.

DB confirms it for the current visit:
- `queue_entries.clinic_status = 'dispensing_payment'`
- `consultations.locked_by = a7dcaa1c-…` (the doctor, not the current user)

### Fix (frontend-only, no migration)
At the dispensary checkout step, the doctor's consultation lock is no longer relevant — pharmacy/cashier always wins. In **`src/pages/clinic/DispenseCheckout.tsx`**:

1. Compute a dispensary-aware override right after `useConsultationLock`:
   ```ts
   const isDispensingStage = entry?.clinic_status === 'dispensing_payment';
   const dispensaryCanEdit = isDispensingStage ? true : canEdit;
   ```
2. Replace every `canEdit` passed into child components with `dispensaryCanEdit`:
   - `CatalogItemPicker` `disabled={!dispensaryCanEdit}`
   - `VisitDetailsColumn` `canEdit={dispensaryCanEdit}` (this is what controls the "VIEW ONLY" badge **and** the Remove / Edit / Qty buttons on every Items / Services / Packages / Documents tab)
   - Keep `canEditInstructions` as-is.
3. Leave `isLockedByOther` / `forceUnlock` banner logic untouched — it stays accurate for non-dispensing stages.

### Why this is safe
- RLS already restricts writes to `is_staff_or_admin(auth.uid())`, so non-staff visitors still cannot delete.
- The lock is only meaningful during the doctor's consultation phase; once the entry advances to `dispensing_payment`, the doctor's session is over.
- Soft-delete (`deleted_at`) means deletions remain auditable; nothing is hard-removed.

### Verification
1. Reload `/clinic/queue/checkout/d14ba08f-…`.
2. "VIEW ONLY" badge disappears; trash/edit icons appear on each row across All / Items / Services / Packages / Documents tabs.
3. Removing a row makes it vanish from the tab and from the billing totals; DB row gets `deleted_at` stamped.
4. Open the same consultation from the doctor view while it is still `in_progress` — lock behavior there is unchanged (still respects the lock).

### Out of scope
- No RLS / migration changes.
- No changes to doctor-side `ConsultationDetail` lock behavior.
- Not auto-clearing `consultations.locked_by` when the visit advances — separate cleanup.
