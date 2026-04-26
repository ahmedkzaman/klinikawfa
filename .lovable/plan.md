## Step 24 (Revised) — Dispense Note Surface + Race-Safe Auto-Seed + Tier-Aware Pricing

This corrects the two revenue-leak risks you flagged: (1) double-billed Consultation Fee from a React 18 Strict-Mode / re-render race during the network window, and (2) the cash-first fallback silently overriding panel pricing.

---

### A. Surface Doctor's Dispense Note in Checkout
**File:** `src/pages/clinic/DispenseCheckout.tsx`

- Import `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert` and `Info` from `lucide-react`.
- The middle workspace column currently renders `<VisitDetailsColumn ... />` directly. Wrap it in a fragment and prepend the conditional alert so it sits **above** the treatment cart:

```tsx
<div className="space-y-4">
  {consultation?.dispense_note?.trim() && (
    <Alert className="bg-yellow-50 border-yellow-200">
      <Info className="h-4 w-4 text-yellow-700" />
      <AlertTitle className="text-yellow-900">Doctor's Instructions</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap text-yellow-900/90">
        {consultation.dispense_note}
      </AlertDescription>
    </Alert>
  )}
  <VisitDetailsColumn consultationId={consultation?.id} canEdit={canEdit} />
</div>
```

- Note: schema column is `dispense_note` (singular, no "s") — confirmed in the `consultations` table. No spec change needed there.

---

### B. Race-Safe Auto-Seed of Consultation Fee
**File:** `src/pages/clinic/ConsultationDetail.tsx`

The current flow at lines 152–177 fires `addItem.mutate(...)` from inside `createConsultation`'s `onSuccess`. Under React 18 Strict Mode the create effect runs twice; the second run sees `consultation` still `null` (network in-flight) and creates a second consultation + second seeded fee. Cache invalidation later collapses to one consultation but the duplicate seeded line items persist.

**Fix:**

1. Add `useRef` to the imports from `react`.
2. Pull `isLoading: preferencesLoading` out of `useClinicPreferences()`:
   ```ts
   const { getPreference, isLoading: preferencesLoading } = useClinicPreferences();
   ```
3. Add two synchronous locks at the top of the component:
   ```ts
   const hasCreatedConsultRef = useRef(false);
   const hasSeededFeeRef = useRef(false);
   ```
4. Replace the auto-create / auto-seed `useEffect` (lines 152–177):
   ```ts
   useEffect(() => {
     if (preferencesLoading) return;
     if (consultLoading) return;
     if (!entry || !doctor) return;
     if (consultation) return;
     if (hasCreatedConsultRef.current) return;

     hasCreatedConsultRef.current = true; // lock BEFORE firing

     createConsultation.mutate(
       {
         queue_entry_id: entry.id,
         patient_id: entry.patient_id,
         doctor_id: doctor.id,
       },
       {
         onSuccess: (newConsultation) => {
           const feeName = getPreference('default_consultation_fee_name', 'Consultation Fee');
           const feePrice = parseFloat(getPreference('default_consultation_fee_price', '0'));
           if (feeName && feePrice > 0 && !hasSeededFeeRef.current) {
             hasSeededFeeRef.current = true; // lock BEFORE seeding
             addItem.mutate({
               consultation_id: newConsultation.id,
               item_name: feeName,
               quantity: 1,
               price: feePrice,
             });
           }
         },
         onError: () => {
           // allow retry on real failure
           hasCreatedConsultRef.current = false;
         },
       },
     );
   }, [preferencesLoading, consultLoading, consultation, entry, doctor]);
   ```

   Why two refs:
   - `hasCreatedConsultRef` blocks duplicate `createConsultation` calls during the ~200ms DB roundtrip and across Strict-Mode double mount.
   - `hasSeededFeeRef` is independently latched so even a malformed re-entry into `onSuccess` cannot re-seed.
   - Both are set **synchronously before** the mutation fires, closing the race window completely.

5. Leave the rest of the component untouched.

---

### C. Tier-Aware Pricing Fallback
**File:** `src/components/clinic/consultation/AddTreatmentBulkDialog.tsx`
**Companion edit:** `src/pages/clinic/ConsultationDetail.tsx` (pass `paymentMethod` prop to dialog)

#### C1. Resolve panel vs cash from the queue entry
In `ConsultationDetail.tsx`, derive the tier from the queue entry (`payment_method` is stored as either `'panel'`, `null`, or sometimes prefixed like `'panel:<panelId>'`):

```ts
const isPanel = (entry?.payment_method ?? '').startsWith('panel');
```

Pass it into the dialog:
```tsx
<AddTreatmentBulkDialog
  open={bulkDialogOpen}
  onOpenChange={setBulkDialogOpen}
  onInsert={handleBulkInsert}
  isPanel={isPanel}
/>
```

#### C2. Update the dialog signature
In `AddTreatmentBulkDialog.tsx`:

```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (items: SelectedItem[]) => void;
  isPanel?: boolean;
}
```

Add the resolver at module scope (above the component):
```ts
const resolvePrice = (
  ...candidates: Array<number | string | null | undefined>
): number => {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};
```

#### C3. Apply tier-aware ordering inside `allItems` builder
Replace the three `combined.push(...)` blocks so `priceNum` is computed via `resolvePrice` with order driven by `isPanel`:

```ts
// Inventory items
inventoryItems.forEach((i) => {
  const ii = i as any;
  const priceNum = isPanel
    ? resolvePrice(ii.standard_panel_price, i.price_to_patient_min, i.price_to_patient_max)
    : resolvePrice(i.price_to_patient_min, i.price_to_patient_max, ii.standard_panel_price);

  const priceLabel =
    i.price_to_patient_min === i.price_to_patient_max
      ? `RM ${Number(priceNum).toFixed(2)}`
      : isPanel
        ? `RM ${priceNum.toFixed(2)} (Panel)`
        : `RM ${Number(i.price_to_patient_min).toFixed(2)} - ${Number(i.price_to_patient_max).toFixed(2)}`;

  combined.push({
    id: i.id,
    name: i.name,
    stock: i.stock,
    uom: i.groups || '—',
    group: i.category,
    price: priceLabel,
    priceNum,
    type: 'item',
    defaults: {
      indication: ii.default_indication ?? null,
      dosage_qty: ii.default_dosage_qty ?? null,
      dosage_unit: ii.default_dosage_unit ?? null,
      frequency: ii.default_frequency ?? null,
      instruction: ii.default_instruction ?? null,
      duration: ii.default_duration ?? null,
      duration_unit: ii.default_duration_unit ?? null,
      precaution: ii.default_precaution ?? null,
    },
  });
});

// Services
services.forEach((s) => {
  const ss = s as any;
  const priceNum = isPanel
    ? resolvePrice(ss.standard_panel_price, s.price_to_patient)
    : resolvePrice(s.price_to_patient, ss.standard_panel_price);
  combined.push({
    id: s.id,
    name: s.name,
    stock: null,
    uom: s.type,
    group: 'Service',
    price: `RM ${priceNum.toFixed(2)}${isPanel ? ' (Panel)' : ''}`,
    priceNum,
    type: 'service',
  });
});

// Packages
packages.forEach((p) => {
  const pp = p as any;
  const priceNum = isPanel
    ? resolvePrice(pp.standard_panel_price, p.price)
    : resolvePrice(p.price, pp.standard_panel_price);
  combined.push({
    id: p.id,
    name: p.name,
    stock: p.stock,
    uom: 'Package',
    group: 'Package',
    price: `RM ${priceNum.toFixed(2)}${isPanel ? ' (Panel)' : ''}`,
    priceNum,
    type: 'package',
  });
});
```

Add `isPanel` to the `useMemo` dependency array for `allItems`.

#### C4. Cast safety
`standard_panel_price` exists on `inventory_items` (confirmed in schema). On services/packages it may not exist as a typed column today; the `(x as any).standard_panel_price` cast plus `resolvePrice` returning `0` for missing/invalid values means the fallback gracefully degrades to `price_to_patient` / `price` without throwing.

---

### Files modified
- `src/pages/clinic/DispenseCheckout.tsx`
- `src/pages/clinic/ConsultationDetail.tsx`
- `src/components/clinic/consultation/AddTreatmentBulkDialog.tsx`

### Files NOT modified
- No DB migration required — `dispense_note` already exists; no new columns needed.
- `useClinicPreferences.ts` already exposes `isLoading`; no change.

### Out of scope (flagged for follow-up, not in this step)
- Per-tier pricing for **services** and **packages** (currently single-column `price_to_patient` / `price`). The tier-aware resolver is forward-compatible — once those tables get a `standard_panel_price` column the panel branch will pick it up automatically.
- Hydrating panel prices via the dedicated `inventory_item_prices` tier table (richer than the single `standard_panel_price` column) — that's a separate pricing-architecture pass.