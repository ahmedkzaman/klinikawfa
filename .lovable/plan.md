# Step 37 — Leaderboards Tab: Active LTV + Doctor Profit Efficiency

## Context

Step 37 adds the **Leaderboards** tab to the Insight dashboard. This surfaces two strategic views:

1. **Active Patient LTV Distribution** — anonymized buckets of cumulative revenue per patient, with a 3-year inactivity hard-stop to exclude churned patients from skewing the median.
2. **Doctor Efficiency Leaderboard** — doctors ranked by **Gross Profit** (not revenue), reusing the existing `useScoreboards` hook to enforce a single source of truth.

The existing `insight_financials_view` already exposes `patient_id`, `revenue`, `profit`, and `visit_date` from Step 36, so **no database migration is required**. `Insight.tsx` already has a placeholder `<TabsContent value="leaderboards">` ready to swap.

---

## A. Patient LTV Hook — `src/hooks/clinic/usePatientLTV.ts` (NEW)

Fetches the **full unbounded history** from `insight_financials_view` (LTV is inherently lifetime, not period-bound).

**Aggregation:**
- Group rows by `patient_id` (skip null IDs).
- Track per-patient: `totalRevenue`, `totalProfit`, `lastVisit` (max of `visit_date`), `visitCount`.

**Recency filter (the "Active" definition):**
- Compute `isInactive = differenceInYears(now, lastVisit) >= 3`.
- Drop inactive patients before computing distribution stats.

**Anonymized return shape (PDPA-safe):**
```ts
{
  histogramData: { name: string; count: number }[]; // 5 buckets
  medianLTV: number;                                 // median totalRevenue of active patients
  activeCount: number;
  inactiveCount: number;
}
```

**Buckets (revenue-based):** `RM 0–200`, `RM 201–500`, `RM 501–1,000`, `RM 1,001–2,500`, `RM 2,500+`

**Implementation notes:**
- Use the `const db = supabase as any` pattern (mirrors `useScoreboards` since the view isn't in generated types).
- Median: sort by `totalRevenue`, pick `Math.floor(activePatients.length / 2)`.
- Cache key: `['patient-ltv']` — no date range, since LTV is lifetime.
- **Never** return `patient_id`, names, or any per-patient object externally.

---

## B. Leaderboards UI — `src/components/clinic/insight/LeaderboardsTab.tsx` (NEW)

Component signature: `({ startDate, endDate }: { startDate: Date; endDate: Date })`

### Layout

**Top row (2-column grid on lg, stacked on mobile):**

1. **LTV Distribution Card**
   - Title: "Active Patient LTV Distribution"
   - Subtitle: "Excludes patients with no visits in > 3 years"
   - Vertical Recharts `BarChart` of `histogramData` with bars in **Emerald-500 (`#10b981`)**, matching the Overview tab's Revenue color.
   - Footer caption: `"{activeCount} active patients · {inactiveCount} excluded as inactive"`.

2. **Acquisition Strategy Card**
   - Title: "Acquisition Strategy"
   - Two stacked stat blocks:
     - **Median Active LTV** — `RM X.XX`
     - **Recommended CAC Ceiling (30%)** — `RM X.XX`, computed as `medianLTV * 0.3`.
   - The CAC block uses a highlighted alert style (`border-l-4 border-primary bg-primary/5 p-4 rounded`) with strategic note:
     > *"To maintain sustainable unit economics, do not spend more than this amount to acquire a single new patient."*

**Bottom row (full-width):**

3. **Doctor Efficiency Leaderboard Card**
   - Title: "Doctor Efficiency Leaderboard"
   - Subtitle: "Ranked by Gross Profit (Revenue − COGS) for the selected period"
   - Reuses `useScoreboards(startDate, endDate)` — **no duplicate hook**.
   - Sort: `[...doctors].sort((a, b) => b.totalProfit - a.totalProfit)` — **CRITICAL: by profit, not revenue**, to discourage low-margin volume gaming.
   - Columns: Doctor · Revenue (RM, right) · Gross Profit (**bold emerald**, right) · Margin % (color-coded)
   - Margin color thresholds (mirror the `marginColorClass` pattern from `ScoreboardsTab`):
     - `≥ 40%` → `text-emerald-600 font-semibold`
     - `20–40%` → `text-amber-600 font-semibold`
     - `< 20%` → `text-red-600 font-semibold`

### States

- **Loading**: Skeletons for all three cards (mirror `ScoreboardsSkeleton`).
- **Error**: Destructive-text card — separately for LTV vs. scoreboards (one can fail without the other).
- **Empty (no active patients)**: Inbox icon + "No active patient history available yet."
- **Empty (no doctors)**: "No doctor performance data for this period."

---

## C. Integration — `src/pages/clinic/Insight.tsx` (EDIT)

Single-line swap inside `<TabsContent value="leaderboards">`:

```tsx
// Before (line 442):
<PlaceholderPanel label="Leaderboards (Step 37) — coming next" />

// After:
<LeaderboardsTab startDate={startDate} endDate={endDate} />
```

Add the import alongside `ScoreboardsTab`. Access control is **already inherited** — `/clinic/insight` is admin-only via existing route guards.

---

## Strategic Audit

- **PDPA-safe by design**: Hook returns only aggregate distribution data — no patient IDs, names, or per-patient rows ever cross the hook boundary.
- **Profit > Revenue**: The leaderboard sort key is deliberately Gross Profit. A doctor pushing high-volume low-margin medications ranks lower than one performing fewer high-margin procedures.
- **Inactivity hard-stop**: The 3-year filter prevents the median from being dragged down by long-dormant patients, grounding CAC guidance in *current* economics.
- **Single source of truth**: Reusing `useScoreboards` ensures Step 36 and Step 37 mathematically agree on every doctor figure.

---

## Files

**New:**
- `src/hooks/clinic/usePatientLTV.ts`
- `src/components/clinic/insight/LeaderboardsTab.tsx`

**Edited:**
- `src/pages/clinic/Insight.tsx` — swap placeholder for `LeaderboardsTab`, add import.

**Verification:** `npx tsc --noEmit` must pass cleanly before handing back.