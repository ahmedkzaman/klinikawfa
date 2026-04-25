# Step 20 — Consultation Concurrency Locking

Filename note: spec references `DispensaryDetail.tsx` — actual file is **`src/pages/clinic/DispenseCheckout.tsx`**, and the editable cart inside it lives in **`src/components/clinic/visit/VisitDetailsColumn.tsx`**. Gating applied at both points.

## A. DB Migration — `<ts>_add_consultation_locks.sql`

```sql
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_consultations_locked_by
  ON public.consultations(locked_by) WHERE locked_by IS NOT NULL;
```

No RLS policy changes — existing `consultations_update_active` (ops/admin) already covers lock writes. `auth.users` types regenerate automatically.

## B. Hooks & Types — `src/hooks/clinic/useConsultations.ts`

1. Extend every `.select('*, …')` to keep returning `*` (already includes the new columns post-regeneration).
2. Add a focused mutation:

```ts
export function useLockConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) => {
      const { error } = await supabase
        .from('consultations')
        .update({
          locked_by: userId,
          locked_at: userId ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultation'] });
    },
    // No toast — lock churn is silent; surface errors only.
    onError: (e: Error) => toast.error(`Lock error: ${e.message}`),
  });
}
```

Pass `userId: null` to release. Keep mutation lightweight (no optimistic update — realtime invalidation in `useConsultation` covers cross-tab sync via existing channel patterns).

## C. Gatekeeper — shared hook `src/hooks/clinic/useConsultationLock.ts` (new)

To avoid duplicating logic across `ConsultationDetail.tsx` and `DispenseCheckout.tsx`:

```ts
export function useConsultationLock(consultation: { id?: string; locked_by?: string | null; status?: string } | null | undefined) {
  const { user } = useAuth();
  const lockMut = useLockConsultation();
  const claimedRef = useRef<string | null>(null);

  const lockedBy = consultation?.locked_by ?? null;
  const myUserId = user?.id ?? null;
  const isLockedByMe = !!lockedBy && lockedBy === myUserId;
  const isLockedByOther = !!lockedBy && lockedBy !== myUserId;
  const isCompleted = consultation?.status === 'completed';
  const canEdit = !isCompleted && (lockedBy === null || isLockedByMe);

  // Auto-claim on mount when free
  useEffect(() => {
    if (!consultation?.id || !myUserId || isCompleted) return;
    if (lockedBy === null && claimedRef.current !== consultation.id) {
      claimedRef.current = consultation.id;
      lockMut.mutate({ id: consultation.id, userId: myUserId });
    }
  }, [consultation?.id, lockedBy, myUserId, isCompleted]);

  // Release on unmount (only if I hold it)
  useEffect(() => {
    return () => {
      if (consultation?.id && claimedRef.current === consultation.id && isLockedByMe) {
        lockMut.mutate({ id: consultation.id, userId: null });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation?.id]);

  const forceUnlock = () => {
    if (consultation?.id) lockMut.mutate({ id: consultation.id, userId: null });
  };

  return { isLockedByMe, isLockedByOther, canEdit, lockedBy, forceUnlock };
}
```

Plus a presentational `<ConsultationLockBanner />` component (`src/components/clinic/consultation/ConsultationLockBanner.tsx`) using `Alert` + `AlertTriangle` icon:

> ⚠️ **FILE IN USE** — This consultation is currently opened by another staff member. Please coordinate with them before making changes to the treatment cart. **[Force Unlock]**

## D. Wire into `ConsultationDetail.tsx`

- Call `const { isLockedByOther, canEdit, forceUnlock } = useConsultationLock(consultation);` after `useConsultation`.
- Render `<ConsultationLockBanner />` at top of `<main>` when `isLockedByOther`.
- Disable `Add in bulk` button (line ~534) and pass a `readOnly` (or `disabled`) prop to `<TreatmentItemCard>` when `!canEdit` — hides Trash + Save inside the card. Existing card already supports a disabled visual via button props.
- `Send to Dispensary` / `Save Draft` / `Put on Hold` remain enabled for the lock holder; disabled when `isLockedByOther`.

## E. Wire into `DispenseCheckout.tsx` + `VisitDetailsColumn.tsx`

- In `DispenseCheckout.tsx`: same hook call + banner above the 3-column grid.
- Pass a new optional prop `canEdit: boolean` to `VisitDetailsColumn`. When `false`: hide the qty +/- and Trash buttons, show a small "view-only" pill in the column header.
- Cart is now editable whenever `canEdit` is true regardless of `clinic_status` being `dispensing_payment` (satisfies spec point: "no longer strictly disabled based purely on status === 'dispensing'").
- `Complete Checkout` button stays gated on `outstanding === 0` only — does **not** require lock (clean handoff: completing also flushes status to `completed`, which the hook treats as non-editable so unmount-release is safe).

## F. Edge cases

- **Tab close / browser crash**: cleanup may not fire → `Force Unlock` button on the banner is the manual escape hatch.
- **Same user opens two tabs**: `isLockedByMe` stays true in both; both can edit (acceptable trade-off, single human user).
- **Race on auto-claim**: two staff opening simultaneously → last write wins on the DB; the loser's next realtime tick flips `isLockedByMe → false` and surfaces the banner. Acceptable for clinic-scale concurrency.
- **Status flip to `completed`**: hook short-circuits auto-claim and treats as non-editable; no orphan locks.

## Files touched

- `supabase/migrations/<ts>_add_consultation_locks.sql` (new)
- `src/hooks/clinic/useConsultations.ts` (add `useLockConsultation`)
- `src/hooks/clinic/useConsultationLock.ts` (new)
- `src/components/clinic/consultation/ConsultationLockBanner.tsx` (new)
- `src/pages/clinic/ConsultationDetail.tsx` (wire hook + banner + disable cart controls)
- `src/pages/clinic/DispenseCheckout.tsx` (wire hook + banner + pass `canEdit`)
- `src/components/clinic/visit/VisitDetailsColumn.tsx` (accept `canEdit`, hide edit affordances)

Verification: `npx tsc --noEmit` after implementation.
