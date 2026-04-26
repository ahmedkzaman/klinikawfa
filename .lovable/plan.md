# Step 35 — Insight Dashboard: Revenue vs. COGS Refactor

Align the existing financial dashboard with GAAP/IFRS unit economics by surfacing **COGS** alongside Revenue, derived client-side from the existing `insight_financials_view`. No database or schema changes.

---

## A. Hook Refactor — `src/hooks/clinic/useFinancialInsights.ts`

**Type extensions** (add `cogs: number` to):
- `InsightSummary` → `totalCogs`
- `DailyTrendPoint` → `cogs`
- `TopItemRow` → `cogs`

**Aggregation logic** (single-pass, near-zero perf cost):
```ts
const cogs = rev - prof; // Derived: COGS = Revenue − Profit
totalCogs += cogs;
day.cogs += cogs;
item.cogs += cogs;
```

---

## B. UI Refactor — `src/pages/clinic/Insight.tsx`

### 1. Metric Cards (4-card Unit Economics grid)
Replace **Patient Volume** card with **COGS**:

| Card | Icon | Value |
|---|---|---|
| Total Revenue | `Wallet` | `summary.totalRevenue` |
| **COGS** | **`PackageMinus`** | **`summary.totalCogs`** |
| Gross Profit | `TrendingUp` | `summary.totalProfit` |
| Gross Margin % | `Percent` | `summary.marginPct` |

### 2. ComposedChart — Revenue vs. COGS + Margin
```tsx
<ComposedChart data={chartData}>
  <CartesianGrid strokeDasharray="3 3" vertical={false} />
  <XAxis dataKey="date" />
  <YAxis yAxisId="left" tickFormatter={(v) => `RM ${v}`} />
  <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
         tickFormatter={(v) => `${v}%`} />
  <Tooltip />
  <Legend />
  <Bar yAxisId="left" dataKey="Revenue" fill="#10b981" radius={[4,4,0,0]} />
  <Bar yAxisId="left" dataKey="COGS"    fill="#94a3b8" radius={[4,4,0,0]} />
  <Line yAxisId="right" type="monotone" dataKey="Margin"
        stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
</ComposedChart>
```

**Critical safeguard:** right Y-axis hard-locked to `domain={[0, 100]}` — prevents auto-scale from making a 2% margin dip look catastrophic.

### 3. Top Items Table & CSV Export
- Add **COGS** column to "Top 10 Profit Leaders" table (between Revenue and Profit).
- Include `cogs` field in the CSV export rows + header row — required for downstream DCF/Excel modelling.

---

## C. Access Control (verify, no changes expected)
- Sidebar link in `ClinicLayout` remains `adminOnly`.
- Route guard in `App.tsx` / `ClinicProtectedRoute` continues to restrict `/clinic/insight` to admin/owner roles.

---

## Files Touched
- `src/hooks/clinic/useFinancialInsights.ts` — type extensions + COGS derivation
- `src/pages/clinic/Insight.tsx` — card swap, chart refactor, table column, CSV export

## Out of Scope (Future)
- Net Profit (requires OpEx model: salaries, rent, utilities)
- DCF valuation engine
- Inventory cost-quality audit page (zero-cost item surfacing)