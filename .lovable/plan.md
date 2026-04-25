# Fix Doctor Lockout — Preserve Historical Immutability

You're correct: stripping `isCompleted` from `useConsultationLock.ts` would let any user re-open and edit a 6-month-old, fully-paid consultation — a serious clinical and LHDN compliance hazard. The fix should instead delay when `consultation.status` becomes `'completed'`, so that the existing immutability guard naturally aligns with the real workflow.

I verified that `DispenseCheckout.tsx` (line 90) is the legitimate point that flips `consultation.status = 'completed'` once payment is finalized. So removing the premature flip from `handleSendToDispensary` is safe — completion will now strictly mean "paid & finalized at front desk".

---

## A. Prevent Premature Completion — `src/pages/clinic/ConsultationDetail.tsx`

In `handleSendToDispensary` (line 307), remove `status: 'completed'` from the `updateConsultation.mutateAsync` payload. Keep saving notes and diagnoses; only the queue entry transitions to `sent_to_dispensary`. The consultation remains `'in_progress'` until `DispenseCheckout` finalizes payment.

```diff
 await updateConsultation.mutateAsync({
   id: consultationId,
   case_note: caseNote,
   dispense_note: dispenseNote,
   diagnosis_id: diagnosisId,
   diagnosis_text: diagnosisText,
-  status: 'completed',
 });
 await updateQueue.mutateAsync({
   id: entry.id,
   clinic_status: 'sent_to_dispensary',
 });
```

## B. Add Reopen Path — `src/pages/clinic/Consultation.tsx`

In the action cell (line 309–318), the `sent_to_dispensary` / `dispensing_payment` branch currently renders only a **Checkout** button. Replace it with a side-by-side pair wrapped in `flex gap-2`:

- **Edit Consultation** — `variant="outline"`, navigates to `/clinic/consultation/${entry.id}`. Lets the doctor re-enter and amend notes/cart while the lock is free.
- **Checkout** — preserves existing behavior, navigates to `/clinic/queue/checkout/${entry.id}`.

## C. Lock Hook — `src/hooks/clinic/useConsultationLock.ts` (NO CHANGES)

Explicitly leave the immutability guard intact:

- Keep `const isCompleted = consultation?.status === 'completed';`
- Keep `const canEdit = !isCompleted && (lockedBy === null || isLockedByMe);`
- Keep `isCompleted` in both `useEffect` early-returns and dependency arrays.

Because Step A delays completion until real checkout, doctors will retain edit access during the dispensing phase via the pessimistic lock, while truly-finalized historical records remain permanently read-only — protecting clinical records and LHDN tax receipts from retrospective edits.

---

## Why this is the right architecture

| Phase | `consultation.status` | `clinic_status` | `canEdit` (doctor) |
|---|---|---|---|
| Doctor consulting | `in_progress` | `with_doctor` | ✅ (lock-gated) |
| Sent to dispensary | `in_progress` | `sent_to_dispensary` | ✅ (lock-gated) — **the fix** |
| Payment in progress | `in_progress` | `dispensing_payment` | ✅ (lock-gated) |
| Paid & closed | `completed` | `completed` | 🔒 read-only forever |

Status semantics now match reality: `completed` = "money has changed hands, file is sealed". The lock manages live concurrency; `isCompleted` enforces historical immutability. The two concerns stay cleanly separated.

## Files touched

- `src/pages/clinic/ConsultationDetail.tsx` — remove premature `status: 'completed'`
- `src/pages/clinic/Consultation.tsx` — add Edit Consultation + Checkout button pair
- `src/hooks/clinic/useConsultationLock.ts` — **unchanged** (guard preserved)
