## Goal

Two related UX upgrades for the Procurement Dashboard:
1. A slide-out **Logic Guide** explaining how Diagnosis Correlation and Purchase Planning are calculated.
2. **Adjustable thresholds** so staff can tune Urgent / Surge / Overstock rules live without code changes.

Both are frontend-only — no schema changes, no migrations.

---

## 1. ProcurementLogicSheet (new component)

**File:** `src/components/clinic/procurement/ProcurementLogicSheet.tsx`

- Built on shadcn `Sheet` (side=right, wide on desktop).
- Props: `open: boolean`, `onOpenChange: (v: boolean) => void`, `defaultSection: 'correlation' | 'planning'`.
- Internally uses `Tabs` with two sections so users can switch without closing.
- **Correlation section** content: plain-English explanation of Association Rule Mining, Confidence (worked Asthma/Salbutamol example), Lift score scale (1.0 = baseline, >1.5 highly correlated, >2 very strong), and what `__UNLINKED__` means.
- **Planning section** content: explains the three rules
  - Urgent Reorder — fast item + days_cover < threshold, suggested qty restores 30-day buffer from 90-day avg burn.
  - Surge Warning — trend >threshold% MoM AND lift >threshold AND days_cover <30.
  - Overstock — 0 usage in 90 days but stock on shelf.
- Uses semantic Tailwind tokens (no hardcoded colors), `prose`-style typography, small worked-example callouts in `Card`-like blocks.

## 2. Adjustable thresholds

**Hook change — `src/hooks/clinic/useProcurementStats.ts`:**
- Add `RecommendationThresholds` type: `{ urgentDays: number; surgeTrendPct: number; surgeLift: number; surgeDaysCover: number; deadStockDays: number }`.
- Add `DEFAULT_THRESHOLDS` constant matching today's hardcoded values (7 / 20 / 1.5 / 30 / 90).
- `useDiagnosisCorrelation` minLift already param-driven — keep as is.
- `useProcurementRecommendations(thresholds?: Partial<RecommendationThresholds>)` — merge with defaults, replace hardcoded `7`, `20`, `1.5`, `30` literals with threshold variables. Overstock list stays driven by `movement_status === 'dead'` (90-day rule is enforced upstream in the view); we still expose `deadStockDays` in the settings UI as informational so the label stays accurate.

**Dashboard — `src/pages/clinic/ProcurementDashboard.tsx`:**
- New local state `thresholds` (defaults from `DEFAULT_THRESHOLDS`), persisted to `localStorage` under `procurement.thresholds.v1` so each user's preference survives reloads.
- Pass `thresholds` into `useProcurementRecommendations` and into the Surge filter in `useDiagnosisCorrelation` (`minLift: thresholds.surgeLift`).
- Header buttons:
  - On Correlation tab header: ghost `Info` button → opens sheet to `'correlation'`.
  - On Planning tab header: ghost `Info` button → opens `'planning'`; gear `Settings` button → opens the new settings dialog.
- Banner on Planning tab when any threshold differs from defaults: "Custom rules active · Reset".

## 3. RecommendationRulesDialog (new component)

**File:** `src/components/clinic/procurement/RecommendationRulesDialog.tsx`

- shadcn `Dialog`.
- Form fields (sliders + number input pair, using shadcn `Slider` + `Input`):
  - Urgent Reorder Buffer (Days) — 1–30, default 7
  - Surge Trend Threshold (%) — 5–100, default 20
  - Surge Lift Threshold — 1.0–5.0 step 0.1, default 1.5
  - Surge Days-Cover Limit — 7–90, default 30
  - Dead-Stock Window (Days) — 30–180, default 90 (informational; tooltip notes it's enforced in the database view)
- Each field has a short helper line so it's self-explanatory.
- Footer: `Reset to defaults` (ghost) · `Cancel` · `Save` (applies + closes + toast).
- Saving writes to parent state + `localStorage`. Dashboard re-renders → recommendations recompute instantly.

## 4. Files touched

```text
NEW  src/components/clinic/procurement/ProcurementLogicSheet.tsx
NEW  src/components/clinic/procurement/RecommendationRulesDialog.tsx
EDIT src/hooks/clinic/useProcurementStats.ts        (thresholds param + defaults)
EDIT src/pages/clinic/ProcurementDashboard.tsx      (state, buttons, wire-up)
```

## Out of scope (deferred)

- Persisting thresholds to `clinic_settings` table (per-user `localStorage` for now — matches the user's "local React state" preference; can be promoted later).
- Per-role permissions on who can change rules.
- A/B comparison of "Recommendations under default vs custom rules".

## Verification

- Open Correlation tab → click Info → sheet opens on Correlation section. Switch tabs inside sheet → Planning section renders.
- Open Planning tab → click Settings gear → change Urgent buffer from 7 → 14 → Save → more items immediately appear in Urgent list.
- Reload page → custom thresholds persist; "Custom rules active" banner shows; Reset restores defaults.
- No TypeScript/lint errors; all colors via semantic tokens.
