## Fix Right-Edge Clipping on Drug Labels (with safety clamps)

### Problem
Right-aligned text (Date, QTY, EXP) anchors to `PAGE_W - MARGIN_X`. A positive `offsetX` pushes that anchor past the thermal printer's right-side dead zone and the text gets silently clipped. The fix uses asymmetric base margins and a hard-clamped right anchor so no calibration value can punch outside the printable area.

### Fix (single file: `src/lib/clinic/printDrugLabel.ts`)

**1. Clamped coordinate math at the top of `drawLabel`** (replaces current `BASE_MARGIN_X` / `SAFE_W` block):

```ts
const { offsetX, offsetY } = getPrinterOffsets();

const BASE_MARGIN_L = 1;
const BASE_MARGIN_R = 3; // thicker right buffer for hardware dead zone

const MARGIN_X     = Math.max(0, BASE_MARGIN_L + offsetX);
const RIGHT_ANCHOR = Math.min(PAGE_W - 1, PAGE_W - BASE_MARGIN_R + offsetX);
const SAFE_W       = RIGHT_ANCHOR - MARGIN_X;
const CENTER_X     = MARGIN_X + SAFE_W / 2;

let y = BASE_START_Y + offsetY;
```

Both edges are clamped so extreme offsets (e.g. +4mm or −5mm) can never escape the 60mm page.

**2. `drawRight` takes an explicit anchor:**
```ts
function drawRight(doc: jsPDF, text: string, y: number, rightAnchor: number) {
  const w = doc.getTextWidth(text);
  doc.text(text, rightAnchor - w, y);
}
```
Update the three call sites (patient-row Date, QTY, EXP) to pass `RIGHT_ANCHOR`.

**3. `drawCentered` accepts a center override:**
```ts
function drawCentered(doc: jsPDF, text: string, y: number, centerX = PAGE_W / 2) {
  const w = doc.getTextWidth(text);
  doc.text(text, centerX - w / 2, y);
}
```
Pass `CENTER_X` from inside `drawLabel` for: clinic name, Tel line, address lines, dosage, frequency, indication (`For: …`), and precaution. Default keeps any future external caller safe.

**4. Dividers use the new anchors:**
Every `doc.line(MARGIN_X, …, PAGE_W - MARGIN_X, …)` becomes `doc.line(MARGIN_X, …, RIGHT_ANCHOR, …)` (header divider, patient-row divider, footer divider).

**5. Wrap widths auto-update:**
`splitTextToSize(…, SAFE_W)`, the patient-name truncation `nameMax`, and the medicine `leftW` calculation already read `SAFE_W` — they pick up the narrower safe area with no further edits.

### Out of scope
- Font sizes, toggle logic, footer content/order, calibration UI/hook, `generateDrugLabelPdf` signature — all untouched.

### Files
- **edit** `src/lib/clinic/printDrugLabel.ts`
