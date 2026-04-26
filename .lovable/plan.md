## Step 39 — Bank Health Radar (Comparative)

A 5-axis radar chart comparing the **current selected period** against the **prior equivalent window** (same day-length, immediately preceding). All metrics normalized to a 0–100 scale so a single glance reveals strengths, fragility, and momentum.

### "No-Glaze" Reality Check

- **Liquidity is currently 100% Cash** (only `cash` exists in `insight_financials_view`). Until panel/insurance billing actually flows through `queue_entries.payment_method`, the Liquidity axis will always read 100. That's accurate — but it means this axis becomes meaningful **only after** the first panel claim is processed. Worth flagging in the tooltip.
- **Risk axis on a single-doctor clinic always reads 0.** With one billing doctor, concentration is 100% by definition. This is not a bug — it's a structural reality the model surfaces honestly.
- **Growth requires prior data.** If the prior period has zero revenue (new clinic), Growth defaults to 50 (neutral) rather than dividing by zero or showing a misleading 100.

---

### A. Data Hook — `src/hooks/clinic/useBankHealth.ts` (NEW)

**Period derivation** using `differenceInCalendarDays` + `subDays` from `date-fns`:
```ts
const days = differenceInCalendarDays(endDate, startDate) + 1;
const priorEnd   = subDays(startDate, 1);
const priorStart = subDays(priorEnd, days - 1);
```

**Two parallel queries** against `insight_financials_view`, selecting:
`visit_date, payment_method, revenue, profit, queue_entry_id, doctor_name`

**Per-period aggregator** (`computeAxes`) returns 5 normalized scores plus raw context for the explainer grid:

| Axis | Formula | Notes |
|---|---|---|
| **Profitability** | `(profit / revenue) × 100` | `0` if revenue = 0 |
| **Risk** | `100 − (topDoctorRev / totalRev × 100)` | Tracks revenue per `doctor_name`; "Unassigned" included |
| **Efficiency** | `Math.min((profit / uniquePatients) / 80 × 100, 100)` | RM 80 profit/visit benchmark; uniquePatients = distinct `queue_entry_id` |
| **Liquidity** | `% revenue from ('cash','qr','credit_card','debit_card')` | Case-insensitive match; null = panel |
| **Growth** | `(currRev − priorRev) / priorRev`, capped ±50%, mapped −50→0, 0→50, +50→100 | Special: `priorRev = 0 ⇒ 50` (neutral) |

**Output shape** (Recharts-ready):
```ts
interface BankHealthData {
  chartData: Array<{ metric: string; current: number; prior: number; fullMark: 100 }>;
  context: {
    current: AxisContext;  // raw values for the explainer grid
    prior:   AxisContext;
    periodLabel: string;       // "Last 30 days"
    priorPeriodLabel: string;  // "Previous 30 days"
  };
  isLoading, isError, error;
}

interface AxisContext {
  revenue: number;
  profit: number;
  marginPct: number;
  topDoctorName: string;
  topDoctorSharePct: number;
  profitPerPatient: number;
  patientCount: number;
  liquidPct: number;
  growthPct: number | null;  // null when prior = 0
}
```

Uses `useQuery` with key `['bank-health', startKey, endKey]` (prior period is derived, not user-selectable, so it doesn't need its own key). The view isn't in generated types → cast `supabase as any` for the read, matching the pattern in `useFinancialInsights.ts`.

---

### B. UI — `src/components/clinic/insight/BankHealthTab.tsx` (NEW)

**Layout** (single column, `space-y-6`):

1. **Header card** — Title "Bank Health" + subtitle showing both period labels (e.g., "**Last 30 days** vs **Previous 30 days**").

2. **Radar chart card** — `ResponsiveContainer` at `h-[420px]`:
   ```tsx
   <RadarChart data={chartData}>
     <PolarGrid stroke="hsl(var(--border))" />
     <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
     <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
     <Radar name="Prior Period"   dataKey="prior"   stroke="#94a3b8"
            fill="transparent" strokeDasharray="3 3" strokeWidth={2} />
     <Radar name="Current Period" dataKey="current" stroke="#059669"
            fill="#10b981" fillOpacity={0.5} strokeWidth={2} />
     <Legend wrapperStyle={{ fontSize: 12 }} />
     <Tooltip formatter={(v: number) => `${v.toFixed(0)} / 100`} />
   </RadarChart>
   ```
   Current is rendered **after** Prior so the solid emerald polygon sits on top of the dashed ghost.

3. **Explainer grid** — `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3` with one card per axis. Each card shows:
   - Metric name + score (e.g., **"Liquidity — 100 / 100"**)
   - Raw context line (e.g., *"100% from instant-cash methods"*)
   - Delta vs prior in muted text (e.g., *"Prior: 100 (no change)"*)

4. **"What does 100 mean?" footnote** — small muted block clarifying each benchmark:
   - Profitability: 100 = every ringgit of revenue is profit (impossible in practice; ~50–70 is excellent)
   - Risk: 100 = revenue evenly spread across many doctors; 0 = one doctor does 100%
   - Efficiency: 100 = avg RM 80+ profit per patient visit
   - Liquidity: 100 = all revenue collected instantly (no panel waiting)
   - Growth: 50 = flat; 100 = +50% period-over-period; 0 = −50%

**Empty / loading states** mirror `ValuationTab`:
- Loading: skeleton card with "Comparing periods…"
- No current-period data: `Inbox` icon + "No financial data in this period."

---

### C. Wiring — `src/pages/clinic/Insight.tsx`

Replace the placeholder at line **452**:
```tsx
<TabsContent value="health">
  <BankHealthTab startDate={startDate} endDate={endDate} />
</TabsContent>
```
Add the import alongside the other insight tabs (line 43).

---

### Files

- **NEW**: `src/hooks/clinic/useBankHealth.ts`
- **NEW**: `src/components/clinic/insight/BankHealthTab.tsx`
- **EDITED**: `src/pages/clinic/Insight.tsx` (1 import + 1 line swap)

### Verification

`npx tsc --noEmit` — confirm Recharts radar prop types and the new hook signature are clean. Then visit `/clinic/insight` → "Bank Health" tab. With current data (5 cash items, 1 doctor) you should see: high Profitability + Liquidity, low Risk (single-doctor reality), Growth near 50 (neutral baseline), and a dashed prior-period ghost trailing the emerald polygon.