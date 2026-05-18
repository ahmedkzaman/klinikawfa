# Fix Consultation Medicine Auto-Save & RLS

## 1. RLS Migration — `consultation_items`

Current `consultation_items_update_active` policy only allows `is_ops_or_admin` (which already includes `admin`, `special_admin`, `doctor_admin`, `operations`, `resident_doctor`) — but **NOT** `doctor` or `locum`. That's why locums get silently rejected.

Migration:
- Drop and recreate `consultation_items_update_active` policy with a broadened predicate that ORs in `has_role(auth.uid(), 'doctor')` and `has_role(auth.uid(), 'locum')` for both USING and WITH CHECK clauses (deleted_at IS NULL stays).

## 2. Auto-Save in `TreatmentItemCard.tsx`

Refactor the manual "Save" button flow into background auto-save:

- Add a debounced auto-save effect (700ms) that fires `onSave(...)` whenever any field (qty, rate, tier, indication, dosageQty, dosageUnit, frequency, instruction, duration, precaution) changes from the last-saved snapshot.
- Use `onBlur` on Input/ComboboxInput as an immediate flush trigger (cancel debounce, save now).
- Track `saveState: 'idle' | 'saving' | 'saved' | 'error'` exposed via a small inline indicator next to the item title (Loader2 spinner for "Saving…", check for "Saved" that fades after 1.5s).
- Replace the explicit "Save" button with a "Done" / collapse toggle. Removing the button avoids double-saves; collapse still works.
- Lift saveState upward via a new `onSavingChange(itemId, isSaving)` callback so the parent knows which cards have pending writes.

## 3. Parent Tracking & "Send to Dispensary" Guard (`ConsultationDetail.tsx`)

- Add a `Set<string>` ref `pendingSavesRef` of item IDs currently saving. Pass `onSavingChange` to each `TreatmentItemCard`.
- In `handleSendToDispensary` (and `handlePutOnHold`), before mutations:
  - If `pendingSavesRef.current.size > 0`, show toast "Saving your edits…" and `await` a small helper `waitForPendingSaves()` that polls (or resolves via a Promise registry) until the set is empty or a 5s timeout.
- Also disable the button when `pendingSavesRef.current.size > 0` (use a `pendingCount` state) to give visual feedback.

## 4. Auto-Save Toast Hygiene

Remove the `toast.success('Treatment item updated')` from `onSave` in `ConsultationDetail.tsx` line 948 — auto-save would spam toasts. The inline "Saved" pill in the card is enough.

## Technical Details

- Files edited:
  - `supabase/migrations/<new>.sql` — RLS update
  - `src/components/clinic/consultation/TreatmentItemCard.tsx` — debounce + indicator + onBlur + onSavingChange prop
  - `src/pages/clinic/ConsultationDetail.tsx` — pendingSavesRef, await before send, remove success toast
- The existing `useUpdateConsultationItem` hook is reused as-is.
- Debounce implementation: `useEffect` with `setTimeout`; clear on unmount and on new change; skip the very first render (compare against initial snapshot from props).
- Saving indicator uses `Loader2` from `lucide-react` (already used in project) plus `cn` utility.
