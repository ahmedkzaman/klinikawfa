# Thermal Drug Label Printout (60×50mm)

A pure HTML/CSS print path for the Gprinter GP-3150TN, sitting alongside the existing jsPDF-based `printDrugLabel.ts`. The browser's native `window.print()` flow gives staff a one-click "Print Drug Labels" button on the dispense checkout screen.

## 1. New component — `src/components/clinic/dispensary/DrugLabelPrintout.tsx`

Props:
```ts
{ consultationId: string; open: boolean; onClose: () => void }
```

Behavior:
- Renders into `document.body` via a React portal targeting a dedicated `<div id="print-root">` (created on mount, removed on unmount).
- Fetches data in a `useQuery` (see §3). While loading, render nothing.
- When `open` flips to `true` and data is ready, call `window.print()` once inside a `useEffect`, then call `onClose()` on the `afterprint` window event.
- Listens for `afterprint` to clean up.

Print CSS (injected once via a `<style>` tag inside the portal):
```css
@media print {
  @page { size: 60mm 50mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  #root > :not(#print-root) { display: none !important; }
  #print-root { display: block !important; }
}
@media screen { #print-root { display: none; } }
```

Per-sticker container:
```
<div class="w-[60mm] h-[50mm] overflow-hidden flex flex-col justify-between p-2
            text-black bg-white leading-tight break-after-page">
```
One container per drug. `break-after-page` (Tailwind v3 utility for `page-break-after: always`) ensures one sticker per physical label.

Layout (top → bottom inside each sticker):
1. **Clinic name** — `text-[8pt] font-bold text-center truncate` (from `clinic_settings` via existing hook, e.g. `useClinicProfile`; if not trivially available, hard-fallback to "Klinik Awfa").
2. **Patient row** — flex row: patient name (`text-[10pt] font-bold truncate flex-1`) + dispense date `dd/MM/yy` (`text-[8pt] text-right shrink-0 ml-1`).
3. **Drug name** — `text-lg font-extrabold leading-tight line-clamp-2` (drug + strength if available, with quantity suffix like `× 20`).
4. **Dosage instructions** — `text-sm font-bold leading-tight line-clamp-3`. Built from `consultation_items.instruction` if present; otherwise composed from `dosage_qty + dosage_unit + frequency + duration` using `FREQUENCY_LABELS` (reuse `src/lib/clinic/prescribingOptions.ts`).
5. **Expiry row** — `text-xs text-right`: `EXP: MM/yyyy` from the earliest `inventory_batches.expiry_date` for that item.

All sizes target a 203 dpi thermal printer at 60×50mm. Tight leading + `overflow-hidden` + `line-clamp-*` guarantee no overflow.

## 2. Trigger — `src/pages/clinic/DispenseCheckout.tsx`

Next to the existing "Print Receipt" button (around line 684–693):
```tsx
<Button variant="outline" size="sm" onClick={() => setPrintLabels(true)}>
  <Tags className="h-4 w-4 mr-2" /> Print Drug Labels
</Button>
```
- Add `const [printLabels, setPrintLabels] = useState(false)`.
- Mount `<DrugLabelPrintout consultationId={consultation.id} open={printLabels} onClose={() => setPrintLabels(false)} />` at the same level as `PrintReceiptDialog`.
- Button is disabled unless `consultation?.id` exists.
- No auto-print on checkout completion — manual trigger only.

## 3. Data fetching (single `useQuery`, key `['drug-labels', consultationId]`)

Step A — pull medication line items:
```ts
supabase
  .from('consultation_items')
  .select(`
    id, item_id, item_name, quantity,
    dosage, dosage_qty, dosage_unit, frequency, duration, instruction, indication,
    inventory_items!inner ( id, name, category, unit_of_measure, uom )
  `)
  .eq('consultation_id', consultationId)
  .is('deleted_at', null)
  .in('inventory_items.category', ['Medication', 'Vaccine']);
```
This excludes consultation fees, procedures, lab investigations, disposables — they live in `services` or have `category != 'Medication' | 'Vaccine'`.

Step B — for each distinct `item_id`, fetch earliest non-expired batch:
```ts
supabase
  .from('inventory_batches')
  .select('item_id, expiry_date')
  .in('item_id', itemIds)
  .gte('expiry_date', today)
  .order('expiry_date', { ascending: true });
```
Reduce to `Map<item_id, earliestExpiry>` (FEFO mirror — actual deduction stays backend-driven).

Step C — pull patient + dispense date in parallel:
- Patient name from `consultations` → `patients.name` (or pass via prop if already loaded — `DispenseCheckout` already has `patient`; accept optional `patientName` / `dispensedAt` props to avoid the extra fetch).
- Dispense date = `new Date()` at print time (or `consultation.completed_at` if set).
- Clinic name from existing `useClinicProfile` / `clinic_settings` hook used by `ClinicProfile.tsx`.

## 4. Out of scope

- No changes to existing `src/lib/clinic/printDrugLabel.ts` (jsPDF path remains).
- No changes to Drug Label settings page or toggles — this is a fixed-layout thermal sticker; user can iterate on toggles later.
- No printer-calibration offsets — `@page` + `margin: 0` is the contract; calibration is the printer driver's job.
- No backend/RPC/migration changes.

## Files touched

- **Create** `src/components/clinic/dispensary/DrugLabelPrintout.tsx`
- **Edit** `src/pages/clinic/DispenseCheckout.tsx` (button + state + mount)
