
## Step 8 — Frontend Port: Dispense & Checkout + Billings

Builds the pharmacist checkout workspace and the financial ledger on top of the existing `payments` / `payment_methods` / `insurance_providers` schema. Inventory math stays server-side — frontend does CRUD only.

### A. Hooks (`src/hooks/clinic/`)

**`usePayments.ts`**
- `usePayments(queueEntryId)` — `payments WHERE queue_entry_id=… AND deleted_at IS NULL`, ordered by `created_at`. Realtime subscription on `postgres_changes` filtered to that queue entry.
- `usePaymentsLedger(fromISO, toISO)` — joined fetch for the Billings page: `payments` + `queue_entries(id, queue_number, clinic_status, created_at, patient_id, patients(name, phone))`.
- `useRecordPayment()` — INSERT `{ queue_entry_id, consultation_id?, payment_type, payment_method, amount, notes? }`. Invalidates `['payments', queue_entry_id]` and `['payments_ledger']`. `onError → toast.error`.
- `useVoidPayment()` — wraps `softDelete('payments', id)` from `@/lib/clinic/softDelete`. Same invalidations. **No hard delete.** `onError → toast.error`.

**`usePaymentMethods.ts`** — `useQuery` returning `payment_methods WHERE status='active' ORDER BY display_order, name`. 5-min stale.

**`useInsuranceProviders.ts`** — `useQuery` returning `insurance_providers WHERE status='active' ORDER BY name`. 5-min stale.

### B. Components (`src/components/clinic/visit/`)

**`VisitDetailsColumn.tsx`** — props: `consultationId`. Lists `consultation_items` via `useConsultationItems`. Each row: name · dosage/frequency/duration · qty stepper (− / + → `useUpdateConsultationItem`) · unit price · line total · trash button (`useRemoveConsultationItem`). Empty state when no items. Inventory triggers handle stock allocation diffs automatically.

**`BillingDetailsColumn.tsx`** — props: `consultationId`, `queueEntryId`, `items`, `payments`.
- Subtotal = `Σ price * quantity` (number-safe).
- Local state: `taxPct` (0), `discountRm` (0). Total = `max(subtotal − discount, 0) * (1 + tax/100)`.
- Paid = `Σ payments.amount` (active only). Outstanding = `max(total − paid, 0)`.
- Lists payment rows: method badge · amount · timestamp · void button (only when `isSpecialAdmin` from `useAuth`).
- "Record Payment" button → opens `RecordPaymentDialog` with prefilled outstanding.

**`RecordPaymentDialog.tsx`** — modal form:
- `payment_type` radio: Self-pay / Panel / Insurance.
- `payment_method` Select sourced from `usePaymentMethods` (filter by `type` matching payment_type when meaningful: `self_pay → cash|card|qr`, `panel|insurance → panel`).
- If Panel/Insurance: show `insurance_provider` Select from `useInsuranceProviders`. Provider name is appended into `notes` ("Provider: …").
- `amount` number (defaults to outstanding, validates `> 0`).
- `notes` textarea.
- Submit → `useRecordPayment.mutate({ queue_entry_id, consultation_id, payment_type, payment_method, amount, notes })` → toast → close.

### C. Pages (`src/pages/clinic/`)

**`DispenseCheckout.tsx`** — route `/clinic/queue/checkout/:queueEntryId`.
- Loads queue entry (`useConsultationQueueEntries` cache → fallback direct fetch by id), consultation (`useConsultation` by `queue_entry_id`), items, payments.
- On mount, if `clinic_status === 'sent_to_dispensary'` → mutate to `'dispensing_payment'` once (guarded with a ref to avoid loops).
- Layout: header (Back to Procurement · patient name · queue # · `StatusBadge`) + 3-col grid `lg:grid-cols-[280px_1fr_360px]`:
  1. **Patient Summary** — name, IC, phone, age/gender, doctor, diagnosis (read-only).
  2. **`VisitDetailsColumn`**.
  3. **`BillingDetailsColumn`**.
- Footer: **Complete Checkout** button. Disabled while `outstanding > 0` (tooltip explains). On click — sequential mutations:
  1. `useUpdateConsultation({ id: consultationId, status: 'completed' })` → `trg_consultations_inventory` commits stock.
  2. `useUpdateQueueEntry({ id: queueEntryId, clinic_status: 'completed' })`.
  3. Toast success → `navigate('/clinic/procurement')`.

**`Billings.tsx`** — route `/clinic/billings`.
- Header: title + date-range pickers (default last 30 days).
- Tabs: **Paid** · **Outstanding Panel** · **Outstanding Self-Pay** with counts.
- Single `usePaymentsLedger(from, to)` fetch. Per-entry items totals computed client-side via a parallel `consultation_items` fetch grouped by `consultation_id` (filter `deleted_at IS NULL`).
- Per-entry derived: `subtotal`, `paid` (sum of active payments on that queue entry), `outstanding`, `latestPaymentType` (most recent active payment's `payment_type`, fallback `'self_pay'`).
- Tab logic:
  - **Paid** — `outstanding <= 0` AND `clinic_status='completed'`.
  - **Outstanding Panel** — `outstanding > 0` AND `latestPaymentType IN ('panel','insurance')`.
  - **Outstanding Self-Pay** — `outstanding > 0` AND `latestPaymentType='self_pay'`.
- Row: queue # · patient · date · subtotal · paid · outstanding · "Open" → `/clinic/queue/checkout/:queueEntryId`.

### D. Routing & sidebar wiring

**`src/pages/clinic/Procurement.tsx`** — replace the inline status-advance buttons with a single "Open" button (icon `ExternalLink`) per row that `navigate('/clinic/queue/checkout/' + entry.id)`. Drop the `useUpdateQueueEntry` import and `handleAdvance` (status auto-advances on the checkout page mount).

**`src/App.tsx`**:
- Add lazy imports: `DispenseCheckout`, `Billings`.
- Inside the `/clinic` route block, add:
  - `<Route path="queue/checkout/:queueEntryId" element={<DispenseCheckout />} />`
  - `<Route path="billings" element={<Billings />} />`
- **Remove** `<Route path="dispensary" element={<Dispensary />} />` and the `Dispensary` lazy import.

**Delete** `src/pages/clinic/Dispensary.tsx`.

**`src/components/clinic/ClinicLayout.tsx`**:
- Swap `Pill` import → `Receipt` (in the `lucide-react` import, keeping other icons).
- Replace `{ href: '/clinic/dispensary', label: 'Dispensary', icon: Pill }` with `{ href: '/clinic/billings', label: 'Billings', icon: Receipt }`.

### Inventory contract (DB-only — not coded)

| Frontend action | DB-side effect (already wired) |
|---|---|
| Add item to consultation | `trg_consultation_items_inventory` reserves `allocated_quantity` |
| Edit item quantity | Trigger reconciles via `reserve_inventory` / `release_inventory` |
| Soft-delete item | Trigger releases reservation |
| Set `consultations.status='completed'` | `trg_consultations_inventory` commits stock (decrements `stock`, drains `allocated_quantity`) |

### Verification

1. `tsc --noEmit` passes; `/clinic/*` loads with no console errors.
2. Procurement → click **Open** on a `sent_to_dispensary` row → lands on `/clinic/queue/checkout/<id>`; status auto-advances to `dispensing_payment`.
3. Edit item qty in middle column → `consultation_items.quantity` updated; `inventory_items.allocated_quantity` reflects diff.
4. Record Cash payment of RM50 → row appears in right column; outstanding drops by 50.
5. With `outstanding = 0` → **Complete Checkout** enabled → click → `consultations.status='completed'`, `queue_entries.clinic_status='completed'`, `inventory_items.stock` decremented by item quantities.
6. `/clinic/billings` shows the entry under **Paid**; underpaid panel/self-pay entries appear under their respective tabs.
7. Sidebar: "Dispensary" gone, "Billings" with `Receipt` icon present; `/clinic/dispensary` 404s inside the clinic shell.
