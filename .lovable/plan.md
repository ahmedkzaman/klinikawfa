## Printer Calibration + Patient-Name Crash Fix

Add per-computer printer offset calibration for the 60×50 mm thermal drug label, and harden the label generator against missing patient names.

### 1. New hook — `src/hooks/clinic/usePrinterSettings.ts`
- localStorage keys: `printer_offset_x`, `printer_offset_y` (mm, decimals OK, default `0`).
- Exports:
  - `getPrinterOffsets(): { offsetX: number; offsetY: number }` — pure reader (used inside the PDF generator, no React).
  - `setPrinterOffsets(o)` — writer, dispatches a `storage`-like event so subscribers refresh.
  - `usePrinterOffsets()` — React hook returning `{ offsetX, offsetY, setOffsets }`, kept in sync via `useState` + `useEffect` listener.

### 2. Patch `src/lib/clinic/printDrugLabel.ts`
- At top of `drawLabel` (called per page), read offsets via `getPrinterOffsets()`:
  ```
  const { offsetX, offsetY } = getPrinterOffsets();
  const MARGIN_X = 1 + offsetX;
  const SAFE_W   = PAGE_W - MARGIN_X * 2;
  let y = 2 + offsetY;
  ```
  Convert current module-level `MARGIN_X` / `SAFE_W` consts into per-call locals; update `drawCentered`/`drawRight` to take `marginX` (or close over locals) so right-alignment honors the new margin. `PAGE_W` / `PAGE_H` stay constant.
- `dividerY = PAGE_H - footerBlockH - … + offsetY` so the footer shifts with vertical offset too (bounded so it never leaves the page).
- **Crash fix**: replace `(patientName ?? '').trim().toUpperCase()` with:
  ```
  const safePatientName = (patientName || 'WALK-IN').toUpperCase();
  ```
  and always render it (drop the "only if rawName" branch) so the top patient row + divider always appear.

### 3. New component — `src/components/clinic/settings/PrinterCalibration.tsx`
Card with:
- Two `Input type="number" step="0.5"` fields bound to `usePrinterOffsets()`: **Horizontal Offset (mm)** and **Vertical Offset (mm)**, with helper text ("Positive → right/down, negative → left/up").
- **Save Calibration** → `setPrinterOffsets({ offsetX, offsetY })` + toast.
- **Print Test Label** → calls `generateDrugLabelPdf` with a dummy item (`TEST DRUG 500MG`, qty 1) and patient `TEST ALIGNMENT`, pulling `clinic` info from `useClinicSettings()`, then `window.open(url, '_blank')`.
- **Reset to 0** secondary button.

### 4. Integration
- Add a new row in `src/pages/clinic/settings/DrugLabelSettings.tsx` (right under the existing label preview card) embedding `<PrinterCalibration />` — it's the natural home next to the label preview and shares clinic settings already loaded there.
- No route changes needed; this page is already registered under Clinic Settings.

### Technical notes
- Offsets live in `localStorage` only (per-computer, intentionally not synced).
- The generator stays a pure function — it just reads localStorage at draw time, so every label (incl. real dispensing prints from `DispenseCheckout`) automatically picks up calibration with zero call-site changes.
- Font sizes, clinic header logic, toggles, and the existing top patient/date layout from the previous task are untouched.

### Files
- **add** `src/hooks/clinic/usePrinterSettings.ts`
- **add** `src/components/clinic/settings/PrinterCalibration.tsx`
- **edit** `src/lib/clinic/printDrugLabel.ts` (offsets + WALK-IN fallback)
- **edit** `src/pages/clinic/settings/DrugLabelSettings.tsx` (mount component)
