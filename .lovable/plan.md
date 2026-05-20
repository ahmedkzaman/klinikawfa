## Goal

Allow the clinic to create "Direct Sale" (counter-only) visits where the dispensary can ONLY add inventory items flagged as OTC (`inventory_items.is_otc = true`). Enforce this both visually and at the data-fetch layer.

## What already exists

- `public.inventory_items.is_otc boolean` already exists in the DB.
- `InventoryItemDialog.tsx` already references `is_otc` in its form. (We'll verify it renders as a toggle; if not, surface it as a Switch.)
- `useInventoryItems` / `useInventoryItemsSafe` hooks exist.
- `queue_entries.visit_purpose` enum is `consultation | follow_up | vaccination | medical_check | procedure | other`. **There is no `visit_type` column and no `direct_sale` concept yet.**
- `DispenseCheckout.tsx` today only renders items the doctor already prescribed (via `VisitDetailsColumn` / `DispensePanel`); it has no item search bar. The actual inventory picker lives in `ConsultationDetail.tsx`.

## Plan

### 1. Database migration — add `visit_type` to `queue_entries`

```sql
ALTER TABLE public.queue_entries
  ADD COLUMN visit_type text NOT NULL DEFAULT 'consultation'
    CHECK (visit_type IN ('consultation','direct_sale'));

CREATE INDEX idx_queue_entries_visit_type ON public.queue_entries(visit_type);
```

No RLS changes — existing policies still apply.

### 2. Registration flow — let staff create a Direct Sale visit

In `src/components/clinic/RegisterAndCheckInDialog.tsx`:
- Add a top-level radio (or segmented control): **Consultation** vs **Direct Sale (OTC only)**.
- When "Direct Sale" is chosen:
  - Hide `visit_purpose`, panel, and doctor-routing fields.
  - On submit, pass `visit_type: 'direct_sale'` to the queue entry insert and set `visit_purpose: 'other'` (or skip).
  - Skip the consultation step and route the new queue entry straight to `sent_to_dispensary` (so it lands in DispenseCheckout immediately).
- Update `useIntakeAppointment` / queue-entry insert helper(s) to forward `visit_type`.

### 3. Inventory hook — accept an `onlyOtc` filter

In `src/hooks/clinic/useInventoryItems.ts`:
```ts
export function useInventoryItemsSafe(opts?: { onlyOtc?: boolean }) {
  const onlyOtc = !!opts?.onlyOtc;
  return useQuery({
    queryKey: ['inventory_items_safe', { onlyOtc }],
    queryFn: async () => {
      let q = supabase.from('inventory_items_safe').select('*').order('name');
      if (onlyOtc) q = q.eq('is_otc', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

Apply the same `onlyOtc` option to `useInventoryItems()` for parity.

### 4. DispenseCheckout — add an OTC-locked item picker for Direct Sale

In `src/pages/clinic/DispenseCheckout.tsx` (and a small new `DirectSaleItemPicker` sub-component, or extend `DispensePanel`):

- Read `entry.visit_type`.
- If `visit_type === 'direct_sale'`:
  - Render an inventory search bar (Combobox) above the cart, calling `useInventoryItemsSafe({ onlyOtc: true })`.
  - Placeholder text: **"Search OTC items only…"** (instead of "Search inventory…").
  - On select → call `addConsultationItem.mutateAsync({ consultation_id, item_name, quantity, price })` (auto-create a lightweight consultation row on first add if one does not exist for this queue entry, so the existing checkout pipeline still works).
  - Show a small info banner: *"Direct Sale: only Over-The-Counter items can be added."*
- If `visit_type === 'consultation'` (default), behaviour is unchanged.

Also enforce server-trust on the client: even if a non-OTC item somehow appears, block `add` with a toast `"Only OTC items can be sold via Direct Sale"`.

### 5. Inventory admin UI — confirm the OTC toggle is visible

In `src/components/clinic/settings/InventoryItemDialog.tsx` and `ItemEditSheet.tsx`:
- Verify the existing `is_otc` field is rendered as a `<Switch>` labelled **"OTC Approved (sellable as Direct Sale)"** with a short help text.
- If currently hidden, expose it in the form. Mapped via `useAddInventoryItem` / `useUpdateInventoryItem` (already supported by `mapItemPayload`).

### 6. Optional UI polish (out of scope unless asked)

- Queue board badge: render a small "Direct Sale" pill next to direct-sale entries.
- Filter Consultation page to exclude `visit_type='direct_sale'` (so doctors don't see them in their queue).

## Acceptance criteria

- A staff member can register a "Direct Sale" queue entry from RegisterAndCheckInDialog.
- That entry lands directly on DispenseCheckout with an OTC-only search bar (placeholder = "Search OTC items only…").
- The search bar's network call carries `is_otc=eq.true`; non-OTC items are never returned.
- Consultation visits behave exactly as before.
- Admins can toggle `is_otc` on any inventory item from the inventory settings dialog, and the change is reflected in the Direct Sale picker immediately.
- TypeScript build passes.
