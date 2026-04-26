# Step 23 — Dual-Ledger Outstanding Balance Interceptor

Surface a patient's historical unpaid balances at check-in time, cleanly separated into **Patient Liability** (cash owed by the patient) and **Panel Liability** (claims pending disbursement from the corporate panel).

---

## Schema reconciliation (read-only inspection done)

The spec references generic columns (`total_amount`, `panel_covered_amount`, `patient_amount_paid`, `panel_amount_paid`). The actual schema stores these across two related tables:

| Spec concept | Actual source |
| :--- | :--- |
| Visit total | Sum of `consultation_items.price * quantity` (per `consultation` for that `queue_entry`) |
| Panel covered amount | `panel_claims.amount` (one row per panel-billed visit) |
| Patient paid | `payments` rows where `payment_type = 'patient'` (or non-`panel`) |
| Panel paid / disbursed | `panel_claims.received_amount` (or `status = 'received'`) |

Derivation per visit:
- `visitTotal = Σ items.price * items.quantity` (active items only, `deleted_at IS NULL`)
- `panelCovered = panel_claims.amount ?? 0` (0 if self-pay)
- `patientPortion = visitTotal − panelCovered`
- `patientPaid = Σ payments.amount` where payment is patient-side, scoped to the queue entry
- `panelReceived = panel_claims.received_amount ?? 0`
- **patientOutstanding** (per visit) = `max(patientPortion − patientPaid, 0)`
- **panelOutstanding** (per visit) = `max(panelCovered − panelReceived, 0)` and only when claim status ∈ {`pending`,`submitted`,`approved`} (exclude `rejected`/`cancelled`/`received`)

A visit is "unpaid" if either ledger > 0. Soft-deleted (`deleted_at`) consultations and items are excluded.

---

## A. New hook — `src/hooks/clinic/usePatientFinancials.ts`

Create `usePatientOutstanding(patientId: string | undefined | null)`:

- Disabled when `patientId` is falsy.
- Single React Query keyed `['patient_outstanding', patientId]`, `staleTime: 30s`.
- Steps inside `queryFn`:
  1. Fetch active `consultations` for the patient (with `queue_entry_id`, `id`).
  2. Fetch `consultation_items` (`consultation_id`, `price`, `quantity`) for those consultation IDs, `deleted_at IS NULL`.
  3. Fetch `payments` (`queue_entry_id`, `amount`, `payment_type`) for those queue entries, `deleted_at IS NULL`.
  4. Fetch `panel_claims` (`queue_entry_id`, `amount`, `received_amount`, `status`) for those queue entries.
  5. Aggregate per visit using the formulas above.
- Returns:
  ```ts
  {
    patientOutstanding: number;
    panelOutstanding: number;
    hasPatientDebt: boolean;   // > 0.005 to avoid float dust
    hasPanelDebt: boolean;
    unpaidVisitsCount: number; // visits where either ledger > 0
    isLoading: boolean;
  }
  ```
- Export a small `formatRm(n)` helper colocated, returning `RM 1,234.50`.

---

## B. UI Update 1 — `src/components/clinic/CheckInWalkInDialog.tsx`

(Note: file lives at `src/components/clinic/CheckInWalkInDialog.tsx`, not `…/patient/…`.)

- Call `usePatientOutstanding(patient?.id)`.
- Below the `<PatientPicker>` block, conditionally render a financial summary:
  - `hasPatientDebt`: `<Alert variant="destructive" className="mt-4">` — "⚠️ Patient Liability: RM X.XX. Please collect this payment before proceeding."
  - `hasPanelDebt`: `<Alert className="mt-2 border-yellow-200 bg-yellow-50 text-yellow-800 [&>svg]:text-yellow-800">` — "📄 Pending Panel Claims: RM X.XX. (Awaiting disbursement from panel)."
- Use the existing `Alert` / `AlertDescription` from `@/components/ui/alert`.
- No hard block — informational only (staff still proceeds), matching the spec wording.

## C. UI Update 2 — `src/components/clinic/RegisterAndCheckInDialog.tsx`

- Detect duplicate IC by querying `patients` by `national_id` once it is fully entered (12 digits) — small inline lookup (or reuse the existing `useSearchPatients` if it accepts ICs; otherwise add a tiny `usePatientByIc(ic)` hook in `usePatients.ts` returning the matched row).
- If a match is found → show the existing/added duplicate-IC alert, and append the dual-ledger lines using `usePatientOutstanding(existingPatient?.id)`:
  - Red destructive line for Patient Liability.
  - Yellow warning line for Panel Liability.
- Both rendered inside the alert body (or two stacked Alerts directly underneath, identical styling to section B).

---

## Files

- **Create**: `src/hooks/clinic/usePatientFinancials.ts`
- **Modify**: `src/components/clinic/CheckInWalkInDialog.tsx`
- **Modify**: `src/components/clinic/RegisterAndCheckInDialog.tsx` (and possibly `src/hooks/clinic/usePatients.ts` for an IC-lookup helper)

No DB migrations required.

---

## Out of scope

- Hard-blocking check-in on outstanding debt (spec says "please collect", informational).
- Recomputing/storing historical totals on `consultations` (kept derived).
- Editing the existing Billing column.
