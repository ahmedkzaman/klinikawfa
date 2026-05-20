## Goal
Universal dispensary item picker that works for both Direct Sale and standard consultations, with a clinical-safety auto-open of the dosage/instructions dialog whenever a non-OTC medicine is added during a consultation.

## 1. File rename + refactor

- Rename `src/components/clinic/visit/DirectSaleItemPicker.tsx` → `src/components/clinic/visit/InventoryItemPicker.tsx`.
- Update the single existing import in `src/pages/clinic/DispenseCheckout.tsx`.
- New props:
  ```ts
  interface Props {
    consultationId: string | null;
    disabled?: boolean;
    mode?: 'direct_sale' | 'consultation'; // default 'direct_sale'
  }
  ```
- Internals:
  - `const onlyOtc = mode === 'direct_sale'` → `useInventoryItemsSafe({ onlyOtc })`.
  - Remove the runtime `if (!p.is_otc) ...` guard when `mode === 'consultation'`.
  - Dynamic copy:
    - Header: `direct_sale` → `"Direct Sale — Add OTC Items"` with `ShoppingBag`; `consultation` → `"Add Item to Consultation"` with `Pill`.
    - Trigger button placeholder + `CommandInput` placeholder:
      - `direct_sale` → `"Search OTC items only…"`
      - `consultation` → `"Search full inventory (verbal order / add-on)…"`
    - Empty state: `"No OTC items match."` vs `"No items match."`
    - Banner:
      - `direct_sale` → keep the amber `Alert` OTC-only banner.
      - `consultation` → render a muted single line (no amber): `"Note: Adding items to a doctor's consultation. Stock will be reserved immediately."`

## 2. DispenseCheckout.tsx wiring

- Remove the `{isDirectSale && (...)}` wrapper around the picker (around line 350) so it always renders.
- Pass `mode={isDirectSale ? 'direct_sale' : 'consultation'}`.
- Leave every other `!isDirectSale` gate untouched (dispense note, attachments, follow-up, etc.).
- Also pass a new `onItemAdded(itemId, picked)` callback (see §3) so DispenseCheckout can own the dialog state — keeps the picker free of routing knowledge.

## 3. Clinical-safety auto-open

Reuse the existing `EditInstructionsDialog` (`src/components/clinic/visit/EditInstructionsDialog.tsx`), which already takes `{ item, open, onOpenChange }` where `item` is a `ConsultationItemRow`-shaped object.

Implementation:

a. **Return the inserted row** from `useAddConsultationItem` (`src/hooks/clinic/useConsultationItems.ts`):
   - Change `.insert(item)` → `.insert(item).select('*').single()`.
   - Return `data` from `mutationFn`.
   - Update `onSuccess` signature accordingly. No other callers need to change because they currently ignore the return value.

b. **In `InventoryItemPicker.tsx`**: after `await addItem.mutateAsync(...)` resolves with the inserted row:
   - If `mode === 'consultation'` AND `picked.is_otc === false` AND inserted row has `item_id`, call `props.onItemAdded?.(insertedRow)`.

c. **In `DispenseCheckout.tsx`**: hold `const [editingItem, setEditingItem] = useState<ConsultationItemRow | null>(null)`. Pass `onItemAdded={setEditingItem}` to the picker. Render below the picker:
   ```tsx
   <EditInstructionsDialog
     item={editingItem}
     open={editingItem !== null}
     onOpenChange={(o) => !o && setEditingItem(null)}
   />
   ```
   The dialog auto-focuses dosage/frequency, forcing the nurse to confirm prescribing details before the bill is finalized.

## 4. RLS

No DB changes. Verified — `consultation_items_ops_insert` already allows `is_ops_or_admin(auth.uid()) OR has_role(auth.uid(), 'locum')`, which covers `operations`, `admin`, `special_admin`, `doctor_admin`, `resident_doctor`, and locums.

## Acceptance criteria

- File `DirectSaleItemPicker.tsx` no longer exists; `InventoryItemPicker.tsx` exists and is imported from DispenseCheckout. No dangling imports. Build passes.
- Standard consultation visit in DispenseCheckout: picker visible, searches full inventory, consultation-mode placeholder + muted banner.
- Direct Sale visit: picker behavior unchanged — OTC-only filter, OTC placeholder, amber banner.
- Adding a non-OTC inventory item during a consultation immediately opens `EditInstructionsDialog` pre-loaded with that row.
- Adding an OTC item (either mode) does **not** open the dialog.
- `consultation_items` insert succeeds for ops/nurse users; existing pricing trigger (`trg_resolve_selling_price`) and reservation trigger (`trg_consultation_items_inventory`) continue to run.
- Operational warning surfaced in chat: unlocking the full catalog lets ops staff add prescription items to a doctor's bill. Auto-opening the dosage dialog mitigates blank-label risk but does not gate POM items — say the word if you also want a hard role-based block on prescription-only items.