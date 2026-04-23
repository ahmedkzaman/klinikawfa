
## Hotfix: Consultation Save Failures

Applying the approved three-part fix exactly as specified.

### 1. Database migration — `vital_signs` write RLS

```sql
CREATE POLICY vital_signs_ops_insert ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_ops_update ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_ops_delete ON public.vital_signs
  FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));
```

### 2. `src/pages/clinic/ConsultationDetail.tsx` — surface silent failures

Replace the three silent early-returns with toasts:

- `handleSaveNotes`, `handleBulkInsert`, `handleSendToDispensary`:
  ```ts
  if (!consultationId) {
    toast.error('Doctor profile missing or consultation not created — contact admin');
    return;
  }
  ```
- `handleSaveVitals` — add guard before save:
  ```ts
  if (!entry || !patient?.id) {
    toast.error('Missing patient or queue data');
    return;
  }
  ```

### 3. `src/hooks/clinic/*` — add `onError` toasts to mutations

In each of the four mutation hooks, add a top-level `onError` to the `useMutation` config that surfaces the failure:

- `useCreateConsultation` (`useConsultations.ts`)
- `useUpdateConsultation` (`useConsultations.ts`)
- `useRecordVitalSigns` (`useVitalSigns.ts`)
- `useAddConsultationItem` (`useConsultationItems.ts`)

```ts
onError: (error: Error) => toast.error(error.message),
```

(For `useAddConsultationItem`, the existing `isInsufficientStock` toast already fires inside `mutationFn` and re-throws with the same message, so the `onError` fallback won't double-toast on stock errors — it just covers the RLS / validation cases.)

`toast` is imported from `sonner` (already used in `useConsultationItems.ts`; will be added to the other two hook files).

### Verification

1. Reload `/clinic/consultation/777d6308…`. With doctor profile still absent, clicking **Save notes** / **Record vitals** / **Add treatment** now shows a clear red toast instead of silent failure.
2. Once a `doctors` row is seeded for the current user (separate follow-up), the same actions succeed and persist on reload.
3. Any future RLS denial on `consultations`, `consultation_items`, or `vital_signs` produces a visible Postgres error toast instead of failing quietly.

Stops after migration + the three file edits.
