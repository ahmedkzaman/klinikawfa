# Step 33 — Record Payment: Atomic Checkout Flow

Refactor `src/components/clinic/visit/RecordPaymentDialog.tsx` so a single click records the payment, completes the consultation, checks out the queue entry, and returns the user to the Queue Board.

## A. Payment Method Logic

Replace the current `usePaymentMethods()` + `filteredMethods` selector with a payment-type–aware UI:

- **Self-pay** (`paymentType === 'self_pay'`) — render a `<Select>` with three hardcoded items:
  - `Cash`
  - `TNG / DuitNow QR`
  - `Credit/Debit Card`
  
  The selected string becomes `payment_method` directly (no lookup needed).

- **Panel** (`paymentType === 'panel'`) — replace the dropdown with a searchable combobox built on `Popover` + `Command` (`CommandInput`, `CommandList`, `CommandEmpty`, `CommandItem`), populated from `useInsuranceProviders({ activeOnly: true })`. Show provider `name` (and `panel_code` as a muted hint where present). Selecting a provider:
  - Sets a local `selectedProviderId` state
  - Sets `payment_method = "Panel: <provider.name>"` for the payment row
  - Resets `amount` to `"0.00"` (still editable so staff can capture co-payments)

- **Insurance** option is removed from the `RadioGroup` (out of scope for this step) — keep only `Self-pay` and `Panel`. The existing `payment_type` enum value `'panel'` is what we send.

When the user toggles `paymentType`, clear method/provider state and reset `amount` to either `defaultAmount` (self-pay) or `0` (panel).

## B. Atomic Checkout Flow

Pull in two more hooks alongside `useRecordPayment`:

```ts
import { useUpdateConsultation } from '@/hooks/clinic/useConsultations';
import { useUpdateQueueEntry } from '@/hooks/clinic/useQueueEntries';
import { useNavigate } from 'react-router-dom';
```

Rewrite `handleSubmit` to run the three mutations sequentially with `mutateAsync` so any failure short-circuits the flow:

```ts
const navigate = useNavigate();
const recordPayment = useRecordPayment();
const updateConsultation = useUpdateConsultation();
const updateQueueEntry = useUpdateQueueEntry();

async function handleSubmit() {
  // ...validation (see section C)

  try {
    // 1. Record payment row
    await recordPayment.mutateAsync({
      queue_entry_id: queueEntryId,
      consultation_id: consultationId,
      payment_type: paymentType,           // 'self_pay' | 'panel'
      payment_method: resolvedMethodLabel, // hardcoded label or "Panel: <name>"
      amount: numericAmount,
      notes: finalNotes || null,
    });

    // 2. Mark consultation completed (only if one exists)
    if (consultationId) {
      await updateConsultation.mutateAsync({
        id: consultationId,
        status: 'completed',
      });
    }

    // 3. Check out queue entry
    await updateQueueEntry.mutateAsync({
      id: queueEntryId,
      clinic_status: 'completed',
    });

    toast.success('Payment recorded · Patient checked out');
    onOpenChange(false);
    navigate('/clinic/queue');
  } catch (err) {
    // Step-specific destructive toast; do NOT close dialog or navigate.
    const msg = err instanceof Error ? err.message : 'Checkout failed';
    toast.error(`Checkout failed: ${msg}`);
  }
}
```

Notes:
- `useRecordPayment`, `useUpdateConsultation`, and `useUpdateQueueEntry` already invalidate their respective query keys on success, so the Queue Board will refresh automatically after navigation.
- `clinic_status = 'completed'` matches the existing enum used elsewhere in the queue flow.

## C. UX & Defensive UI

- Compute a single `isSubmitting` flag:
  ```ts
  const isSubmitting =
    recordPayment.isPending ||
    updateConsultation.isPending ||
    updateQueueEntry.isPending;
  ```
- Submit button:
  - Import `Loader2` from `lucide-react`.
  - When `isSubmitting`, render `<Loader2 className="h-4 w-4 animate-spin mr-2" />` plus contextual label (`Recording…` / `Completing visit…` / `Checking out…` based on which mutation is pending — fall back to `Processing…`).
  - Disabled when `isSubmitting` OR no method/provider selected:
    - Self-pay: disabled if `selectedSelfPayMethod` is empty
    - Panel: disabled if `selectedProviderId` is empty
- Cancel button is also disabled while `isSubmitting` to prevent half-completed flows from being abandoned.
- Validation that runs **before** the try/catch:
  - Amount must parse to a finite number `>= 0` (panel can be 0; self-pay must be `> 0`).
  - Method/provider must be selected (already enforced by disabled state, but re-check defensively).
  - Surface validation failures with `toast.error(...)` and return early.
- On error from any of the three mutations: show destructive toast, **keep the dialog open**, and leave all form state intact so staff can adjust and retry. Do not navigate.

## Files

- **Edited**: `src/components/clinic/visit/RecordPaymentDialog.tsx` — replace method-selection UI, add panel combobox, wire the 3-step atomic flow, add `Loader2` spinner + per-step button labels, remove the `insurance` radio option, drop the `usePaymentMethods` dependency.

No DB migrations, no new files, no schema changes — all referenced hooks (`useRecordPayment`, `useUpdateConsultation`, `useUpdateQueueEntry`, `useInsuranceProviders`) already exist with the required signatures.
