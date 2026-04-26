# Step 38 — VIP Radar: Primary Diagnosis Column

Augment the VIP Patient Radar with a **Primary Condition** column derived from each patient's most-frequent recorded diagnosis. This converts the radar from a pure financial ranking into a clinical-persona map that will feed the Step 39 DCF model.

The migration already emits `diagnosis_name` from `insight_financials_view` (with `LEFT JOIN` falling back to `'Undiagnosed'`), so no SQL changes are required.

---

## A. Hook update — `src/hooks/clinic/usePatientLTV.ts`

1. **Extend the select** to pull `diagnosis_name` from `insight_financials_view`.
2. **Extend `ViewRow`** with `diagnosis_name: string | null`.
3. **Extend `PatientAcc`** with `diagnosisCounts: Map<string, number>` (initialised to an empty Map for each new patient).
4. **In the row loop**, increment `diagnosisCounts` for the row's `diagnosis_name`, but **skip `'Undiagnosed'` and null/empty values** so the primary condition only reflects real clinical signals.
5. **In the top-50 mapping**, walk `diagnosisCounts` to find the highest-count entry; default to `'Unspecified'` when the map is empty (i.e. the patient only has undiagnosed encounters).
6. **Extend `VipPatientRow`** with `primary_diagnosis: string`.

Tie-breaker is intentionally "first encountered wins" — acceptable for low data volumes, and the `'Unspecified'` fallback itself becomes a data-quality signal as called out in the audit.

## B. UI update — `src/components/clinic/insight/LeaderboardsTab.tsx`

1. **Header**: insert `<TableHead>Primary Condition</TableHead>` between **Reg. No** and **Visits** (line ~249).
2. **Body**: insert a new `<TableCell className="text-muted-foreground italic text-sm">{p.primary_diagnosis}</TableCell>` in the same position so the diagnosis sits visually subordinate to the hard financial figures.
3. **Visibility**: the table already renders unconditionally for any non-empty `top50`, including a single patient — no gating change required.
4. **Position**: the radar already sits between the Acquisition Strategy cards and the Doctor Efficiency Leaderboard — no reordering needed.

## C. Verification

- Run `npx tsc --noEmit` and confirm a clean pass before reporting back.
- No database migration, no new files, no auth changes.

---

## Files touched

- **Edited**: `src/hooks/clinic/usePatientLTV.ts`
- **Edited**: `src/components/clinic/insight/LeaderboardsTab.tsx`
