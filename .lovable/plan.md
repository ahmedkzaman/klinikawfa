# Drug Label Y-Axis Overflow Guard

Add a bottom-up overflow guard to `drawLabel` in `src/lib/clinic/printDrugLabel.ts`. Footer geometry is computed first; the body then degrades gracefully (shrink → truncate → drop) so nothing crosses the footer divider.

## Steps (all inside `drawLabel`)

1. **Move footer math to before the body block.** Compute `footerLines`, `footerBlockH`, `dividerY` right after the header divider. Define:
   ```ts
   const bodyBottom = dividerY - 0.6;
   const fits = (h: number) => y + h <= bodyBottom;
   ```
   The footer is *drawn* in its existing position at the end of the function — only the *computation* moves up.

2. **Medicine block guard.** Wrap with `splitTextToSize` (already done). Reserve dosage room:
   ```ts
   const dosageReserve = lh(fsInstr) + 0.4;
   let medLines = allMedLines.slice(0, 2);
   if (medLines.length === 2 &&
       medTop + medLineH * 2 + 1.2 + dosageReserve > bodyBottom) {
     medLines = allMedLines.slice(0, 1);
   }
   ```

3. **Dosage block — never drop, only shrink.**
   ```ts
   let dosagePt = fsInstr;
   while (!fits(lh(dosagePt) + 0.4) && dosagePt > fsInstr - 1.5) dosagePt -= 0.5;
   ```
   Use `dosagePt` for the bold dosage line.

4. **Frequency — shrink → cap to 1 line → drop.**
   - Shrink font by 0.5pt steps (floor `fsInstr - 1.5`) until one line fits.
   - If still failing with 2 lines, cap `freqLines` to 1.
   - If even 1 line at floor font doesn't fit, skip the block.

5. **Indication — shrink → truncate with "…" → drop.**
   - Shrink from 5pt floor 4pt.
   - If `For: <indication>` overflows `SAFE_W` at floor font, truncate the indication string and append `…` until it fits one line.
   - If even truncated single line doesn't fit vertically, drop.

6. **Precaution — same ladder, dropped first** (lower clinical priority than indication).

7. **Footer drawing block stays put** at the end of the function, using the already-computed `dividerY`.

## Notes
- `lh(pt) = pt * 0.42` is the existing mm/pt helper — unchanged.
- No DB or settings changes; on-screen Drug Label preview unaffected.
- The `unit`-from-`inventory_items` work shipped previously is untouched.

## Acceptance
- 3-line generic drug name + long instruction: body auto-shrinks/truncates; footer pixel-stable; no crossover.
- Short content: visually identical to current output.
- Dosage line is always present (clinical guarantee); precaution drops before indication.
