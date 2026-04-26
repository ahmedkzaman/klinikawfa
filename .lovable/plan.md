# Step 38 — DCF Valuation Engine Tab

## Goal
Replace the "Valuation" placeholder in `Insight.tsx` with an interactive DCF (Discounted Cash Flow) calculator that derives a baseline from existing financial data and lets the owner stress-test growth, WACC, OpEx, and terminal-growth assumptions.

## A. New component — `src/components/clinic/insight/ValuationTab.tsx`

**Data source**
- Consume `useFinancialInsights(startDate, endDate)` and read `data.summary`. The hook returns `{ data, isLoading, isError }` — not the destructured `{ summary, isLoading, isEmpty }` shape from the user's snippet. I'll correct that during implementation and derive `isEmpty` locally as `!data || data.summary.totalRevenue === 0`.
- Annualize the period: `annualizedRevenue = totalRevenue * (365 / days)` where `days = differenceInCalendarDays(endDate, startDate) + 1`.
- Derive `cogsRatio = totalCogs / totalRevenue` from history (the GAAP-aligned ratio already computed by the hook).

**Inputs (Shadcn `Slider` + `Input` + `Label`)**
- Expected Annual Growth — slider, 0–30%, default 10%.
- Discount Rate (WACC) — slider, 5–25%, default 12%.
- Annual OpEx (MYR) — numeric input, default = `annualizedRevenue * 0.6`, user-overridable (tracked via nullable `customOpex` state).
- Terminal Growth Rate — slider, 0–5%, default 2%.

**DCF math (`runDCF` helper)**
For `t = 1..5`:
- `Revenue_t = min(annRev * (1 + g)^t, 5,000,000)` — hard RM 5M revenue cap per year.
- `GrossProfit_t = Revenue_t * (1 - cogsRatio)`
- `FCF_t = GrossProfit_t - OpEx`
- `DiscFCF_t = FCF_t / (1 + wacc)^t`

Terminal value (Gordon Growth, only when `wacc > terminalGrowth`):
- `TV = (FCF_5 * (1 + tg)) / (wacc - tg)`
- `DiscTV = TV / (1 + wacc)^5`
- `EV = Σ DiscFCF_t + DiscTV`

If `wacc ≤ terminalGrowth`, exclude terminal value and surface a warning alert ("WACC must exceed Terminal Growth").

**Visuals**
- **Hero Card**: large EV figure in emerald when positive, slate when ≤ 0, with the WACC/TV warning inline when applicable.
- **5-Year Projection Chart**: Recharts `ComposedChart` with Revenue & Gross Profit bars and Discounted FCF line; tooltips formatted as MYR.
- **Sensitivity Matrix**: `Table` with WACC rows `[8, 10, 12, 14, 16, 18, 20]` × Growth columns `[0, 5, 10, 15, 20, 25]`. Each cell shows compact MYR EV; cells where `wacc ≤ tg` render "—". The cell matching the user's current sliders is highlighted.

**States**
- Loading: skeleton/placeholder card.
- Empty baseline: empty-state card prompting the user to widen the date range.
- Error: destructive alert.

**Disclaimer footer**
> *Indicative model based on current margins and user assumptions. Not a substitute for professional financial valuation.*

## B. Wiring — `src/pages/clinic/Insight.tsx`
- Add `import { ValuationTab } from '@/components/clinic/insight/ValuationTab';`
- Replace the placeholder at lines 446–448:
  ```tsx
  <TabsContent value="valuation">
    <ValuationTab startDate={startDate} endDate={endDate} />
  </TabsContent>
  ```

## C. Verification
- Run `npx tsc --noEmit` and confirm clean.
- Manual smoke check on `/clinic/insight` → Valuation tab: drag Growth slider and confirm the projection chart bends upward and flattens against the RM 5M cap; set WACC ≤ TG to confirm the warning state.

## "No-glaze" caveats (carried into the disclaimer)
- OpEx is held constant across all 5 years — high-growth scenarios will overstate FCF because real fixed costs scale with capacity.
- Revenue cap is fixed at RM 5M to prevent fantasy projections from a single small clinic location.

## Files
- **New**: `src/components/clinic/insight/ValuationTab.tsx`
- **Edited**: `src/pages/clinic/Insight.tsx`