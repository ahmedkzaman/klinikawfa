# Why the Edit button is missing

On `/clinic/queue/checkout/:id` (DispenseCheckout) the visit panel is rendered as:

```tsx
<VisitDetailsColumn canEdit={canEdit} ... />
```

`canEdit` comes from `useConsultationLock(...)` — the same lock that protects the doctor's consultation screen. Once the consultation is locked/closed, `canEdit = false`, and inside `VisitDetailsColumn` the new Pencil button is wrapped in `{item.item_id && canEdit && (...)}`, so it disappears together with the qty +/- and Trash buttons. That is exactly the "VIEW ONLY" badge visible in the screenshot.

So the dialog code is fine, the database RLS is fine — the button is simply never rendered for the nurse.

# Fix

Decouple "can edit prescribing instructions" from "can edit the whole visit (qty / remove)". Dispensary staff should always be able to fix dosage / unit / frequency / instruction / duration on medicine rows, regardless of the doctor's consultation lock. Quantity changes and row removal stay tied to `canEdit` because those touch billing and inventory reservations.

### Changes

1. **`src/components/clinic/visit/VisitDetailsColumn.tsx`**
   - Add a new prop `canEditInstructions?: boolean` (defaults to `canEdit` for back-compat on the doctor's `VisitDetail` page).
   - Pass it down into `ItemList` alongside `canEdit`.
   - Render the Pencil "Edit instructions" button when `item.item_id && canEditInstructions` (independent of `canEdit`).
   - Leave the qty +/- and Trash buttons gated by `canEdit` as today.
   - "Print label" stays available whenever `item.item_id` is present (it's a read-only action) — small UX win for the same view.

2. **`src/pages/clinic/DispenseCheckout.tsx`**
   - Pass `canEditInstructions={true}` to `VisitDetailsColumn`. The lock-driven `canEdit` stays as-is so qty/remove remain blocked when the doctor closes the consultation.

3. **`src/pages/clinic/VisitDetail.tsx`**
   - No change required — without the new prop it falls back to `canEdit` and behaves exactly as before.

# Verification

- Open a checked-out visit in `/clinic/queue/checkout/...` with the consultation closed → "VIEW ONLY" badge stays (qty/remove still hidden), but the Pencil button now appears next to "Print label" on each medicine row.
- Click Pencil → dialog opens, edits save (RLS `consultation_items_update_active` already permits `operations` / `admin`), label preview reflects new text immediately.
- Doctor screen (`/clinic/visit/...`) behaves identically to today — Pencil only shows while the doctor holds the lock.
