# Dynamic "Other Charges" — Settings + Checkout (revised)

A clinic-wide registry of optional billing charges that admins manage in Settings and front-desk staff toggle on per visit. **Part 3 revised to batch-commit on checkout** to avoid ghost rows / race conditions.

## Part 1 — Database (`clinic_charge_types`)

Single migration:

- Table `public.clinic_charge_types`
  - `id uuid pk default gen_random_uuid()`
  - `name text not null unique`
  - `default_amount numeric(10,2) not null default 0`
  - `is_active boolean not null default true`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()` + `update_updated_at_column` trigger
- RLS:
  - **Select** — any user passing `is_staff_or_admin(auth.uid())`.
  - **Insert / Update / Delete** — only `is_ops_or_admin(auth.uid())`.
- Seed (idempotent `INSERT … ON CONFLICT (name) DO NOTHING`):
  - "Documentation Fees", "Prescription Fees", "Regulatory Compliance Charges", "Special Care Charges", "Special Procedure Charges" — all `default_amount = 0`, `is_active = true`.

## Part 2 — Settings page

**Route:** `/clinic/settings/charges` — gated `ops_or_admin`.
**File:** `src/pages/clinic/settings/ChargesSettings.tsx`

Bento layout matching other settings pages. Table: Name · Default Amount (RM) · Status · Actions.
- **Add new** — header button → dialog (`name`, `default_amount`).
- **Edit** — pencil icon → same dialog prefilled.
- **Toggle active** — `Switch` in Status column (soft-disable; row hidden from checkout when off).

**Hook:** `src/hooks/clinic/useClinicChargeTypes.ts` exporting `useClinicChargeTypes({ activeOnly })`, `useUpsertChargeType`, `useToggleChargeType`. Cache key `['clinic_charge_types']`, toast feedback.

**Sidebar:** add "Other Charges" card to `SettingsPage.tsx` (visible to `isOpsOrAdmin`).

## Part 3 — Checkout integration (batch-commit)

**File:** `src/components/clinic/visit/BillingDetailsColumn.tsx`

New "Other Charges" section between Tax/Discount and Total:

```text
[ ] Documentation Fees           [ amount ]
[ ] Prescription Fees            [ amount ]
[ ] Regulatory Compliance        [ amount ]
…
```

### Local-state model (no DB writes on toggle)

```ts
const [selectedCharges, setSelectedCharges] =
  useState<Record<string, number>>({}); // key = charge_type_id, value = amount
```

- Toggle ON → set `selectedCharges[id] = chargeType.default_amount`.
- Toggle OFF → delete the key.
- Edit amount → update the value in place (purely local; no flashing loading states).
- `useClinicChargeTypes({ activeOnly: true })` provides the list.

### Live total preview

Extend the existing memo:

```ts
const otherChargesTotal = Object.values(selectedCharges)
  .reduce((a, v) => a + (Number(v) || 0), 0);
const subtotalWithCharges = subtotal + otherChargesTotal;
const afterDiscount = Math.max(subtotalWithCharges - discountRm, 0);
const total = afterDiscount * (1 + taxPct / 100);
```

A new "Other Charges" subtotal row appears above Total when any are selected so the pharmacist sees exactly what's being added.

### Batch commit on Complete Checkout

Lift commit responsibility into `BillingDetailsColumn` via a small imperative handle (or pass `selectedCharges` + a commit callback up to `DispenseCheckout` — preferred so existing `handleComplete` stays the orchestrator):

1. `BillingDetailsColumn` exposes `selectedCharges` through a new `onChargesChange` prop.
2. `DispenseCheckout.handleComplete` does, **in order**, before status updates:
   - For each `[id, amount]` in `selectedCharges`, call `useAddConsultationItem` with
     `{ consultation_id, item_name: chargeType.name, quantity: 1, price: amount }`.
     Use `Promise.all` so it's a single round of parallel inserts.
   - Then run the existing `updateConsultation → completed` and `updateQueue → completed`.
3. If any insert fails, abort the status updates and surface the toast — the visit stays open so the user can retry.

The "Outstanding > 0 disables Complete Checkout" guard already uses `total`, which now includes `otherChargesTotal` via the lifted state — so the existing tooltip behaviour Just Works.

### Why no marker prefix or pre-check logic

Because charges are written only at the moment of completion, there's no need to recognise pre-existing `[Charge] …` rows on mount. `item_name` is stored verbatim from `clinic_charge_types.name`. The `trg_resolve_selling_price` trigger trusts the supplied `price` (no `item_id`), and `trg_lock_cogs` defaults `unit_cost` to 0 — both behave correctly for this use case.

## Files

- New: migration, `useClinicChargeTypes.ts`, `ChargesSettings.tsx`
- Edited: `App.tsx` (route), `SettingsPage.tsx` (card), `BillingDetailsColumn.tsx` (Other Charges section + lifted state), `DispenseCheckout.tsx` (batch-insert in `handleComplete`)
