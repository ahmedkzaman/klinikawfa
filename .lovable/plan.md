
## Goal

Split visit liability between Corporate Panel and Patient in `DispenseCheckout`. Allow zero-liability panel checkouts (no payment method required) and support partial co-pays when the panel coverage is reduced below the grand total.

## Scope

Single file: `src/pages/clinic/DispenseCheckout.tsx` (frontend only).
The `checkout_visit` RPC already accepts `p_payment_type: 'panel'` and `p_panel_provider_id`. Panel coverage accounting is handled downstream via `panel_claims`, so no DB migration is required for the basic split. A `p_panel_covered_amount` parameter will be sent — if the RPC ignores it the existing claim flow still records full coverage, and we can wire the param into the RPC in a follow-up.

## Changes (all in DispenseCheckout.tsx)

### 1. State & math

- Add `const [panelCoveredAmount, setPanelCoveredAmount] = useState<number>(0);`
- Add `const [panelCoveredInput, setPanelCoveredInput] = useState<string>('');` for the editable input (keeps the field controlled while the user types decimals).
- Rename the meaning of `totalDue`:
  - `grandTotal = outstanding + otherChargesTotal` (replaces current `totalDue`)
  - `patientDue = Math.max(0, grandTotal - panelCoveredAmount)`
- `useEffect` on `[grandTotal, panelId]`: if `panelId` present, default `panelCoveredAmount` and `panelCoveredInput` to `grandTotal` (full coverage). If no `panelId`, force both to 0. Use a `userEditedPanelRef` so manual edits aren't overwritten by item changes — but always clamp to `[0, grandTotal]`.
- Pre-fill `amountPaidInput` with `patientDue` (instead of the old `totalDue`), respecting the existing `userEditedAmountRef`.

### 2. UI — panel coverage input + 3-line summary

In the fixed footer:

- When `panelId` is present, render a number input **"Covered by Panel (RM)"** bound to `panelCoveredInput`, with `min=0`, `max=grandTotal`, `step=0.01`. On change: update both `panelCoveredInput` and `panelCoveredAmount` (clamped), and mark `userEditedPanelRef.current = true`.
- Replace the current single "Total due" line with:
  ```
  Grand Total:        RM XX.XX
  Covered by Panel:  -RM XX.XX     (only when panelId)
  Patient Pays:       RM YY.YY
  ```
  Self-pay keeps a single "Total due" line.

### 3. Conditional patient payment UI + validation

- When `patientDue === 0`:
  - Hide the **Method** select and **Amount Paid** input.
  - Skip the `paymentMethod` / `safeAmountPaid <= 0` / `isOverpay` clauses in `canSubmitCheckout` and in `handleComplete`.
  - Button label: **"Complete Panel Checkout"**.
- When `patientDue > 0`:
  - Show Method + Amount Paid (existing fields, with `safeAmountPaid` validated against `patientDue` instead of the old `totalDue`).
  - Pre-fill Amount Paid with `patientDue`.
  - Button label: **"Record Co-pay & Complete"** when `panelCoveredAmount > 0`, otherwise the existing **"Complete Checkout"** / **"Record Partial Payment"** logic.

### 4. RPC payload

In `handleComplete`:

```ts
supabase.rpc('checkout_visit', {
  p_queue_entry_id: queueEntryId,
  p_consultation_id: consultation.id,
  p_total_amount: grandTotal,
  p_amount_paid: patientDue === 0 ? 0 : safeAmountPaid,
  p_payment_method: patientDue === 0 ? 'panel' : paymentMethod,
  p_payment_type: panelId ? 'panel' : 'self_pay',
  p_panel_provider_id: panelId ?? null,
  p_panel_covered_amount: panelCoveredAmount,   // new — RPC may ignore until wired
  p_other_charges: selectedCharges.map(c => ({ name: c.name, amount: c.amount })),
  p_notes: null,
})
```

Cast the call to `any` for the new param to satisfy the generated RPC types until the migration lands.

### 5. Success toast

- `patientDue === 0` → "Panel checkout completed".
- Otherwise keep existing paid / partial-payment messages.

## Out of scope

- No changes to `BillingDetailsColumn`, `DispensePanel`, per-item pricing, or the medication-discount logic.
- No DB migration in this pass. A follow-up can add a `p_panel_covered_amount` argument and persist it on `panel_claims.amount` so reduced-coverage co-pays update the claim ledger correctly.
