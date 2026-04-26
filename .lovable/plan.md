# Step 31 — True 60×50mm Thermal Label Printing

## Why the current print is A4

`PrintLabels` currently renders inside `<VisitDetailsColumn>`, which lives deep inside the `/clinic/queue/checkout/...` layout (sidebar, header, max-width container, paddings). When `window.print()` fires, the browser keeps the entire DOM intact and only relies on `display: hidden` / `print:block` utilities — there is **no `@page` rule**, so the browser falls back to the user's default paper (A4/Letter) and inherits parent layout constraints. That is the "A4 creep" the user described.

The fix is two-fold:

1. **Escape the layout** by rendering the label markup as a direct child of `<body>` via `ReactDOM.createPortal`.
2. **Force the paper size** with a scoped `<style>` that injects `@page { size: 60mm 50mm; margin: 0 }` and hides every `body > *` except the portal during `@media print`.

---

## A. Print infrastructure changes — `src/components/clinic/visit/VisitDetailsColumn.tsx`

**Imports to add**
- `createPortal` from `react-dom`
- `useDrugLabelSettings` from `@/hooks/clinic/useDrugLabelSettings`

**Wire up settings**
Inside `VisitDetailsColumn`, fetch `const { data: labelSettings } = useDrugLabelSettings();`. If undefined (first load), fall back to a defaults object where every `show_*` flag is `true` so we never accidentally print a blank label while the singleton row is still loading.

**Replace `PrintLabels`** (lines 601–658) with a new `ThermalLabelPortal` component that:
- Returns `null` when `rows.length === 0`.
- Calls `createPortal(<>{styleTag}{labels}</>, document.body)` so the markup mounts as `<body><div id="thermal-label-portal">…</div></body>`.
- Renders one `<ThermalLabel>` per row inside `#thermal-label-portal`.

**Print trigger flow** (keep existing `printQueue` state + `useEffect` from lines 128–143):
- `setPrintQueue([item])` → React commits the portal → `setTimeout(window.print, 50)` → `afterprint` clears the queue. No change to that orchestration.
- The portal unmounts itself (returns `null`) once `printQueue` is empty, so the hidden node never lingers in the DOM.

**Where it mounts in JSX**
Replace the current conditional at lines 380–383 with:
```tsx
<ThermalLabelPortal
  rows={printQueue}
  patientName={patientName ?? null}
  settings={labelSettings ?? DEFAULT_LABEL_SETTINGS}
/>
```
(Drop the now-obsolete `PrintLabels` function.)

---

## B. Scoped print stylesheet

Inside `ThermalLabelPortal`, render a `<style>` element as a sibling of the label container (still inside the portal so it lives directly under `<body>`):

```css
@media print {
  /* Hide the entire app, keep only the portal visible */
  body > *:not(#thermal-label-portal) { display: none !important; }

  #thermal-label-portal {
    display: block !important;
    width: 60mm;
    margin: 0;
    padding: 0;
  }

  /* Tells the browser the physical roll dimensions */
  @page {
    size: 60mm 50mm;
    margin: 0;
  }

  .thermal-label-page {
    width: 60mm;
    height: 50mm;
    padding: 2mm 3mm;
    box-sizing: border-box;
    page-break-after: always;
    font-family: 'Inter', system-ui, sans-serif;
    color: #000;
    overflow: hidden;
    position: relative;
    background: #fff;
  }
  .thermal-label-page:last-child { page-break-after: auto; }
}

/* On screen: the portal is fully hidden so devs/QA never see it */
@media screen {
  #thermal-label-portal { display: none; }
}
```

Notes:
- `body > *:not(#thermal-label-portal)` is the surgical hide — it leaves the portal as the only visible top-level node, which prevents A4 fallback from inherited paddings.
- Keeping a `screen` rule means we don't need to add any `hidden`/`sr-only` class and accidentally clip the print preview in some browsers.
- Using `mm` units (rather than `px`) is what actually persuades Chrome/Edge/Safari/Firefox to accept the custom `@page size`.

---

## C. `ThermalLabel` layout (Yezza mirror)

A new internal component renders one label. Layout is a vertical flex stack inside `.thermal-label-page`:

1. **Header row** — flex, baseline-aligned, font-size ≈ 8pt, bold uppercase clinic name on the left:
   - `KLINIK AWFA` (always shown — mandatory).
   - Right-aligned `Tel: 018-252 3531` only when `settings.show_tel_number`.
   - Below it, single line `B2 & B4, Jalan KS 1/12, KotaSAS, 25200 Kuantan` only when `settings.show_address` (truncated with `text-overflow: ellipsis` to stay one line).
   - Thin `<hr>` separator (`border-top: 0.5px solid #000`).

2. **Medication block** — bold 11–12pt uppercase `item.item_name`. Mandatory (no toggle).

3. **Indication line** — small italic 8pt `For: <indication>` only when `settings.show_indication` and `item.indication` is set.

4. **Instructions** — bold 10pt centered, joining `buildDosageBits(item)` with " | ". Mandatory (it's the safety-critical line). Followed by a solid `<hr style={{ border: 0, borderTop: '1px solid #000', margin: '1mm 0' }} />`.

5. **Precaution** — italic 8pt prefixed with `⚠` only when `settings.show_precaution` and `item.precaution` is set.

6. **Duration** — 8pt `Duration: <duration>` only when `settings.show_duration` and `item.duration` is set.

7. **Footer row** — flexbox, justified, 8pt:
   - Left: `QTY: <quantity>` when `settings.show_quantity`.
   - Middle: `Date: <today, dd/MM/yy>` when `settings.show_date`.
   - Right: `EXP: <today + 30d, dd/MM/yy>` when `settings.show_expiry_date`. (Expiry is a placeholder — no expiry column exists on `consultation_items` yet, so we show today + 30 days as a reasonable dispensing-window default. If a real expiry source is added later, swap it in.)

8. **Patient line** — 8pt: `<patientName>` (uppercase, bold) — mandatory when `patientName` is provided.

9. **Fixed bottom strip** — absolutely positioned at the bottom-center of `.thermal-label-page`, 7pt italic: `Ubat Terkawal / Controlled Medicine`. Always rendered (regulatory).

All sizes use `pt` so they map predictably to physical mm at print time.

---

## D. Data handling

- `patientName` is already piped from `DispenseCheckout.tsx` → `VisitDetailsColumn` (verified at line 110, and `DispenseCheckout` already passes `patient?.name`). No further wiring needed.
- `buildDosageBits(item)` (lines 61–69) is reused as-is for the instructions line.
- `useDrugLabelSettings()` (existing hook, includes optimistic updates) drives every conditional render. A constant `DEFAULT_LABEL_SETTINGS` (all `true`) covers the loading state so the user never prints an under-populated label by accident.
- No new database migration, no schema change.

---

## Files modified

- `src/components/clinic/visit/VisitDetailsColumn.tsx`
  - Add `createPortal` import + `useDrugLabelSettings` import.
  - Add `DEFAULT_LABEL_SETTINGS` constant.
  - Replace `PrintLabels` (lines 601–658) with `ThermalLabelPortal` + internal `ThermalLabel`.
  - Update the JSX mount point (lines 380–383) to use the new portal component and pass `labelSettings`.

No other files require changes.

---

## QA checklist (post-implementation)

1. From `/clinic/queue/checkout/:id`, click **Print label** on a single medicine → browser print dialog should show paper size **60mm × 50mm** (or "Custom" with those dims) and the preview should be **only** the label, no sidebar/header.
2. Click **Print all labels** with 3 medicines → preview shows 3 pages, each 60×50mm, with `page-break-after: always` between them.
3. Toggle off `show_address` in Settings → Drug Label, then trigger a print → the address line disappears from the preview.
4. Toggle off `show_tel_number`, `show_indication`, `show_precaution`, `show_duration`, `show_quantity`, `show_date`, `show_expiry_date` individually → confirm each disappears without breaking layout balance.
5. Confirm `KLINIK AWFA`, the medication name, the instructions line, the patient name, and the "Ubat Terkawal / Controlled Medicine" footer are always present regardless of toggles.
6. Confirm the rest of the screen UI (Patient panel, Billing panel, etc.) is hidden in the print preview.
