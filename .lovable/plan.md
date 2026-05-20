## Goal
Eliminate silent failures when adding services/packages/inventory to the consultation cart: defensive payload, RLS-safe insert return, and a tight error path with no double toasts.

## Changes

### 1. `src/hooks/clinic/useConsultationItems.ts` — `useAddConsultationItem`
- Replace insert chain:
  - From: `.insert(item).select('*').single()`
  - To:   `.insert(item).select().maybeSingle()`
- Keep error handling and `onSuccess`/`onError` blocks unchanged. `onSuccess` already invalidates `['consultation_items', vars.consultation_id]`.

### 2. `src/components/clinic/visit/CatalogItemPicker.tsx` — `handleAdd`
- Replace the soft "Preparing session…" guard with a hard block:
  ```ts
  if (!consultationId) {
    toast.error('Error: No consultation ID found for this visit.');
    return;
  }
  ```
- Compute fallback price safely across catalog shapes (cast to `any` to keep TS happy — inventory rows have `price_to_patient_max`, services have `price_to_patient`, packages have `price`):
  ```ts
  const fallbackPrice = Number(
    (p as any).price_to_patient_max ??
    (p as any).price_to_patient ??
    (p as any).price ??
    0
  );
  ```
- Build payload with `price: fallbackPrice` so NOT NULL never trips before `trg_resolve_selling_price` overwrites it for catalog rows:
  ```ts
  const payload: Parameters<typeof addItem.mutateAsync>[0] = {
    consultation_id: consultationId,
    item_name: p.name,
    quantity: Math.max(1, Math.floor(qty || 1)),
    price: fallbackPrice,
  };
  if (catalog === 'inventory') payload.item_id = p.id;
  else if (catalog === 'service') payload.service_id = p.id;
  else payload.package_id = p.id;
  ```
- Try/catch:
  - **Try (after await)**: success toast `Added ${p.name}`, run the existing auto-open-instructions branch (only when `inserted` is truthy and has `item_id`), then `resetPick()`.
  - **Catch**:
    ```ts
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Not enough stock')) {
      toast.error('Failed to add: ' + msg);
    }
    ```
    The stock sentinel is already toasted by the hook → no double toast. All other errors surface clearly. No success logic in catch.

### 3. No changes
- Cache invalidation (already correct in the hook).
- DB / RLS / migrations.
- Other call sites of `useAddConsultationItem` (none affected by the `maybeSingle` change — they already null-check `inserted`).

## Acceptance
- Service or package add → row appears instantly, green "Added X" toast, no console error.
- Inventory add with stock → row appears, green toast.
- Inventory add with no stock → single red "Not enough stock available for this item." toast.
- Missing `consultationId` → red "Error: No consultation ID found for this visit.", no mutation.
- Any other DB/RLS/constraint error → red "Failed to add: <message>" toast.
- RLS hides the inserted row (`maybeSingle` returns `null`) → no crash, cart refreshes via invalidation, success toast still shows.
