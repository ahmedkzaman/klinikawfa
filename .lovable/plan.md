# Fix Drug Label: Dynamic Unit + Y-Axis Overlap

## 1. Surface the inventory `unit` on consultation items

**`src/hooks/clinic/useConsultationItems.ts`** — `useConsultationItems()` query:
- Replace `.select('*')` with an explicit select that joins the inventory row:
  ```ts
  .select('*, inventory_items(unit)')
  ```
- Manual rows (free-text) and service/package rows have `item_id = null`, so the join is `null` for them — already handled by the optional chaining downstream.

**`src/components/clinic/visit/VisitDetailsColumn.tsx`**:
- Extend `ConsultationItemRow` with `inventory_items: { unit: string | null } | null`.
- No other code paths use `unit`, so nothing else changes here.

## 2. Pipe `unit` into the label PDF

**`src/lib/clinic/printDrugLabel.ts`**:
- Add `unit?: string | null` to `DrugLabelItem`.
- In `drawLabel`, build `qtyText` as:
  ```ts
  const unitLabel = (item.unit ?? '').trim();
  const qtyText = toggles.show_quantity && item.quantity != null
    ? `QTY: ${item.quantity}${unitLabel ? ' ' + unitLabel : ''}`
    : '';
  ```
- Rationale: if the admin leaves the inventory `unit` blank, label prints `QTY: 1` (matches user's documented expectation) instead of a misleading "Tab/s".

## 3. True dynamic Y stacking below the medicine name

Current bug: `medLines` is hard-capped at 2, but `medBlockH` uses that same capped count with a tight `lh(pt) = pt * 0.42`. With longer names + bold weight, baselines compress and the next block ("15 ML" dosage row) starts before the second medicine line has finished rendering.

Fix in `drawLabel`:
- Compute `medLines` from `splitTextToSize(...)` first **without** the `.slice(0, 2)` cap, then cap it for drawing only.
- Use a slightly more honest line-height factor for the bold medicine block (`lh(pt) * 1.15` or constant `medLineH = fsMed * 0.5` mm) — still proportional to the typography scale from `drug_label_settings`, so the Settings → Drug Label preview stays in sync.
- Recompute:
  ```ts
  const medLineH = fsMed * 0.5;            // mm, honors typography scale
  const drawnLines = medLines.slice(0, 2);
  const medBlockH = medLineH * drawnLines.length;
  ```
  Draw each line at `medTop + medLineH * (i + 1) - medLineH * 0.2`.
- Then advance:
  ```ts
  y = medTop + Math.max(medBlockH, 4.4) + 1.2;   // guaranteed gap below name
  ```
- Apply the same `lh(pt)` review to the dosage/frequency block so the downstream Y cursor stays correct (already additive, just needs the new constant).
- QTY/EXP right column stays anchored to `medTop` (top-aligned with first med line) — unchanged, but since `leftW` already reserves room for it horizontally, there's no horizontal collision either.

## Out of scope
- No DB migration. `inventory_items.unit` already exists.
- No changes to `DrugLabelSettings` schema or the on-screen preview component (it reads the same toggles + font sizes).
- Services / packages: `item_id` is null → `inventory_items` join is null → `unit` blank → label simply prints `QTY: n` without a unit, which is correct for non-dispensed line items.

## Acceptance
- Printing a label for "SYP. PARACETAMOL" (with `unit = 'Btl'`) shows `QTY: 1 Btl`.
- Long medicine names that wrap to 2 lines no longer overlap the dosage row.
- The Settings → Drug Label live preview is unaffected (no toggle / setting changes).
