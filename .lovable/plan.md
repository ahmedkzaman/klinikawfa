# Step 36 — Strategic Insight Suite Foundation

Adds analytical dimensions (doctor, diagnosis, patient, kind) to the financial view, builds the **Scoreboards** tab, and restructures the Insight page into a 5-tab layout.

---

## A. Database Migration — Extend `insight_financials_view`

**Current view** (verified via `pg_get_viewdef`):
```sql
SELECT ci.id, ci.item_name, date(qe.created_at) AS visit_date,
       qe.payment_method,
       ci.price * ci.quantity AS revenue,
       (ci.price - ci.unit_cost) * ci.quantity AS profit,
       qe.id AS queue_entry_id
FROM consultation_items ci
JOIN consultations c ON ci.consultation_id = c.id
JOIN queue_entries qe ON c.queue_entry_id = qe.id
WHERE c.status = 'completed' AND ci.deleted_at IS NULL AND c.deleted_at IS NULL;
```

**Migration:** Drop and recreate to add new dimensional columns while preserving every existing column (so Step 35 keeps working).

```sql
DROP VIEW IF EXISTS public.insight_financials_view;

CREATE VIEW public.insight_financials_view AS
SELECT
  ci.id,
  ci.item_name,
  date(qe.created_at)               AS visit_date,
  qe.payment_method,
  (ci.price * ci.quantity)::numeric                      AS revenue,
  ((ci.price - ci.unit_cost) * ci.quantity)::numeric     AS profit,
  qe.id                              AS queue_entry_id,
  -- New analytical dimensions
  c.doctor_id,
  COALESCE(d.name, 'Unassigned')     AS doctor_name,
  c.diagnosis_id,
  COALESCE(dx.name, NULLIF(c.diagnosis_text, ''), 'Undiagnosed') AS diagnosis_name,
  qe.patient_id,
  CASE
    WHEN ci.service_id IS NOT NULL THEN 'service'
    WHEN ci.item_id    IS NOT NULL THEN 'medication'
    WHEN ci.package_id IS NOT NULL THEN 'package'
    ELSE 'other'
  END                                AS kind
FROM public.consultation_items ci
JOIN public.consultations c       ON ci.consultation_id = c.id
JOIN public.queue_entries qe      ON c.queue_entry_id = qe.id
LEFT JOIN public.doctors d        ON c.doctor_id = d.id
LEFT JOIN public.diagnoses dx     ON c.diagnosis_id = dx.id
WHERE c.status = 'completed'
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;
```

**Why LEFT JOIN doctors/diagnoses:** captures unattributed visits as `Unassigned`/`Undiagnosed` — surfacing them as a clinical-risk/data-quality signal instead of silently dropping them.

**Backward compatibility:** all columns consumed by `useFinancialInsights.ts` (`id, item_name, visit_date, payment_method, revenue, profit, queue_entry_id`) are preserved unchanged. No existing hook needs editing.

---

## B. New Hook — `src/hooks/clinic/useScoreboards.ts`

Single React Query hook that fetches the extended view once and aggregates **four datasets** in-memory:

```ts
export interface DoctorScore {
  doctorId: string | null;
  doctorName: string;
  uniquePatients: number;     // Set<patient_id>.size
  totalRevenue: number;
  totalCogs: number;          // revenue - profit
  totalProfit: number;
  revenuePerPatient: number;  // totalRevenue / uniquePatients
  marginPct: number;
}

export interface DiagnosisRank {
  diagnosisId: string | null;
  diagnosisName: string;
  encounters: number;         // Set<queue_entry_id>.size
  totalRevenue: number;
}

export interface MedicationRank {
  itemName: string;
  totalRevenue: number;
  totalQuantity: number;      // proxied via row count for now (qty not exposed; see note)
}

export interface ProcedureROI {
  itemName: string;
  count: number;              // queue_entry_id distinct
  totalRevenue: number;
  totalCogs: number;
  marginPct: number;          // (revenue - cogs) / revenue * 100
}

export interface ScoreboardsData {
  doctors: DoctorScore[];           // sorted by revenuePerPatient desc
  topDiagnoses: DiagnosisRank[];    // top 10 by encounters
  topMedications: MedicationRank[]; // top 10 by totalRevenue
  procedureRoi: ProcedureROI[];     // sorted by marginPct desc
}
```

**Implementation notes:**
- Same `format(startDate)`/`format(endDate)` window contract as `useFinancialInsights` for consistency.
- Single SELECT pulling new columns plus existing financial fields; aggregate client-side using `Map` + `Set` (mirrors the proven pattern in `useFinancialInsights.ts`).
- COGS derivation is `revenue - profit` (GAAP-aligned, same as Step 35).
- Quantity is not in the view today — `totalQuantity` for medications uses **row count** as a frequency proxy (line-item occurrences). If true quantity is needed later, we extend the view with `SUM(ci.quantity)` in a follow-up.
- Use the same loose-typed client cast (`supabase as any`) that `useFinancialInsights.ts` uses, since the view isn't in generated types until the next type sync.

---

## C. Scoreboards UI — `src/components/clinic/insight/ScoreboardsTab.tsx`

A stateless component that takes the date range as props and renders four panels:

### 1. Doctor Performance (Table)
Columns: **Doctor · Patients · Revenue · Revenue/Patient · Margin %**.
- Sorted by `revenuePerPatient` desc.
- `Revenue/Patient = ΣRevenue / Unique Patients`.
- Includes an `Unassigned` row when present (highlighted with muted styling) — your front-desk attribution audit signal.

### 2. Top Diagnoses (Horizontal BarChart, top 10 by encounters)
- Recharts `BarChart` with `layout="vertical"`, `YAxis dataKey="diagnosisName" type="category"`, `XAxis type="number"`.
- Bar fill: `hsl(var(--primary))`.
- `Undiagnosed` will surface naturally if doctors skip the diagnosis field — your clinical documentation audit signal.

### 3. Top Medications (Horizontal BarChart, top 10 by revenue)
- Same orientation as #2; bar fill `#10b981` (Emerald, matches Revenue color from Overview tab).
- Tooltip shows revenue formatted as `RM xx.xx`.

### 4. Procedure ROI (Table, `kind = 'service'`)
Columns: **Procedure · Count · Revenue · Margin %**.
- Margin cell color-coded:
  - **Emerald-500** if `marginPct >= 40`
  - **Amber-500** if `20 <= marginPct < 40`
  - **Red-500** if `marginPct < 20`
- Sorted by `marginPct` desc to surface the most efficient procedures first.

**Layout:** Doctor table full-width on top, then a 2-col grid for the two bar charts, then the Procedure ROI table full-width. All wrapped in Shadcn `<Card>`s with `<CardHeader>`/`<CardTitle>`.

**Empty/Loading:** Reuses the same `<Skeleton>` and `<Inbox>` empty-state pattern as the Overview tab for visual consistency.

---

## D. UI Restructure — `src/pages/clinic/Insight.tsx`

Wrap the existing page body in Shadcn `<Tabs>`:

```tsx
<Tabs defaultValue="overview" className="w-full">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="scoreboards">Scoreboards</TabsTrigger>
    <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
    <TabsTrigger value="valuation">Valuation</TabsTrigger>
    <TabsTrigger value="health">Bank Health</TabsTrigger>
  </TabsList>

  <TabsContent value="overview">{/* existing cards/charts */}</TabsContent>
  <TabsContent value="scoreboards">
    <ScoreboardsTab startDate={startDate} endDate={endDate} />
  </TabsContent>
  <TabsContent value="leaderboards"><PlaceholderPanel label="Leaderboards (Step 37)" /></TabsContent>
  <TabsContent value="valuation"><PlaceholderPanel label="DCF Valuation Engine (Step 38)" /></TabsContent>
  <TabsContent value="health"><PlaceholderPanel label="Bank Health Radar (Step 39)" /></TabsContent>
</Tabs>
```

- The shared **header** (title + date range picker + CSV download) stays *above* the `<Tabs>` so the date range applies across every tab.
- `<PlaceholderPanel>` is a tiny inline component: a `<Card>` with a muted "Coming in Step XX" message — keeps the tab shell clean without scaffolding empty hooks.
- Loading/error/empty states currently inside the body remain inside the **Overview** `<TabsContent>` so each tab manages its own emptiness.

---

## E. Access Control

The `/clinic/insight` route is already gated for admin/owner (existing `ClinicProtectedRoute` config — no change required). New tab is mounted inside the same protected page.

---

## F. Verification

After implementation, run `npx tsc --noEmit` to confirm a clean compile, then stop and confirm before moving to Step 37.

---

## Files

**New:**
- `supabase/migrations/<timestamp>_extend_insight_financials_view.sql`
- `src/hooks/clinic/useScoreboards.ts`
- `src/components/clinic/insight/ScoreboardsTab.tsx`

**Edited:**
- `src/pages/clinic/Insight.tsx` (wrap body in `<Tabs>`, mount Scoreboards + 3 placeholders)
