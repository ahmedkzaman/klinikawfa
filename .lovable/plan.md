# Procurement Intelligence — Stage 3 & 4

Builds the diagnosis↔stock correlation engine and rule-based purchase planning UI on top of the Stage 1 movement view.

## Architectural guardrails

- **Unlinked leakage** — all aggregations use `LEFT JOIN consultations → diagnoses`. Rows with no consultation, no diagnosis, or a soft-deleted consultation fall into a synthetic `__UNLINKED__` bucket so totals always reconcile with physical stock.
- **No live lift math** — confidence/lift live in a materialized view refreshed nightly (and on-demand). React only reads.
- **Diagnosis grouping** — reuse existing `diagnoses.group_category` column (no new table). Raw `Uncategorized` rows surface a callout linking to the Diagnosis Sweeper.

## 1. Database migration

### Materialized view `public.mv_diagnosis_stock_correlation`

Columns: `diagnosis_group`, `inventory_item_id`, `item_name`, `case_count_current_month`, `case_count_prior_month`, `case_trend_pct`, `item_usage_count`, `co_occurrence_cases`, `total_cases_for_group_90d`, `total_cases_with_item_90d`, `total_cases_90d`, `confidence_pct`, `lift_score`, `last_refreshed_at`.

- Source: `inventory_transactions` filtered to `transaction_type='dispense'` over last 90 days, `LEFT JOIN consultations LEFT JOIN diagnoses`, grouped by `COALESCE(diagnoses.group_category, '__UNLINKED__')`.
- Bucket totals computed in CTEs (not recalculated per row).
- Indexes: `(diagnosis_group)`, `(inventory_item_id)`, UNIQUE `(diagnosis_group, inventory_item_id)` to enable `REFRESH … CONCURRENTLY`.

### RPC `public.refresh_diagnosis_correlation()`
SECURITY DEFINER, gated by `is_ops_or_admin`. Runs `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_diagnosis_stock_correlation`.

### Wrapper view `public.v_diagnosis_stock_correlation`
Standard view with `security_invoker = on` selecting from the MV, filtered by `is_ops_or_admin(auth.uid())`. Only the wrapper is granted to `authenticated` (MVs cannot enforce RLS).

### Parity check
Migration logs a `NOTICE` comparing `SUM(item_usage_count)` in the MV vs raw dispense ledger over 90d so we can confirm the LEFT JOIN reconciles.

`pg_cron` schedule is deferred — manual "Refresh Now" button validated first, then set up the 02:00 MYT cron afterwards.

## 2. Hooks — `src/hooks/clinic/useProcurementStats.ts` (additive)

- `useDiagnosisCorrelation({ minLift = 0, includeUnlinked = false })` — selects from `v_diagnosis_stock_correlation`, sorted `lift_score DESC NULLS LAST`.
- `useRefreshCorrelation()` — mutation calling the RPC; invalidates correlation + recommendations.
- `useProcurementRecommendations()` — client-side join of `useProcurementStats()` + `useDiagnosisCorrelation()` returning:
  - `urgent`: `days_cover < 7 && movement_status === 'fast'`
  - `surge`: `case_trend_pct > 20 && lift_score > 1.5 && days_cover < 30`
  - `overstock`: `movement_status === 'dead' && current_stock > 0`

## 3. UI — two new tabs in `ProcurementDashboard.tsx`

### Tab 3 — Diagnosis Correlation
- Header: last-refreshed timestamp + "Refresh Now" (admin only).
- Alert (when any `Uncategorized` rows exist): "X diagnoses need grouping" → links to Diagnosis Sweeper.
- Filters: "Hide low-lift (< 1.2)" (default ON), "Include unlinked usage" (default OFF).
- Table: Diagnosis Group · Cases (current with ↑/↓ %) · Top Item · Confidence % · Lift Score badge (≥2 red, ≥1.5 amber, <1 muted).

### Tab 4 — Purchase Planning
Three stacked sections rendering recommendation cards:
- **Urgent** 🚨 `{Item} — {days_cover}d cover. Reorder ~{ceil(avg_daily_usage*30) − current_stock} units.` + "Create PO" → `/clinic/procurement?prefillItem={id}&qty={n}`.
- **Surge** 📈 `{Group} up {X}%. High correlation to {Item} (Lift {L}). Recommend increasing par level.` + "Create PO".
- **Overstock** 🧊 `{Item} is Dead (0 usage 90d) but has {stock} left. Monitor expiry {nearest_expiry_date}.`

Empty states per section. No edits to Stage 1 view, ledger tab, or dispensing flow.

## 4. Verification

- `SUM(item_usage_count)` in MV ≈ `SUM(|qty_change|)` in raw dispense ledger (90d).
- Items never linked to a consultation still appear under `__UNLINKED__` when the toggle is on.
- Deleting recent URTI consultations + refresh → group drops out of Surge.
- Refresh latency <2s on current data volume; Tab 3 query <300ms.

## Files

- New migration (MV + wrapper view + RPC + indexes + parity NOTICE).
- Edit `src/hooks/clinic/useProcurementStats.ts` (additive only).
- Edit `src/pages/clinic/ProcurementDashboard.tsx` (two new tabs).
- Procurement page reads `?prefillItem=&qty=` on mount — minimal change to surface the deep-link; full PO prefill polish deferred to Stage 5 if more is needed.

## Out of scope

- `pg_cron` schedule registration (do manually after MV validated).
- Statistical significance gating beyond raw lift threshold.
- Forecasting / seasonality (Stage 5).
- Per-doctor prescribing variance.
