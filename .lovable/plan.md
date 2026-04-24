

## Add "Put on Hold" Button to Consultation Detail Page (hardened)

Adds the missing pause action to the doctor's workspace, with proper error handling and double-click protection.

---

### 1. New handler in `src/pages/clinic/ConsultationDetail.tsx`

Add alongside `handleSendToDispensary`. Wrapped in `try/catch` so a failed `updateConsultation` doesn't strand the doctor on a dead button — they get a clear error toast instead.

```tsx
const handlePutOnHold = async () => {
  if (!entry) return;

  try {
    // Persist any draft notes first, so nothing is lost
    if (consultationId) {
      await updateConsultation.mutateAsync({
        id: consultationId,
        case_note: caseNote,
        dispense_note: dispenseNote,
        diagnosis_id: null,
        diagnosis_text: diagnosisText,
      });
    }

    await updateQueue.mutateAsync({
      id: entry.id,
      clinic_status: 'on_hold',
    });

    toast.success(`${patient?.name ?? 'Patient'} placed on hold`);
    navigate('/clinic/consultation');
  } catch (error: any) {
    toast.error(`Failed to place on hold: ${error.message || 'Unknown error'}`);
  }
};
```

### 2. Button in the sticky action footer

Insert between **Save Draft** and **Send to Dispensary**. The disabled guard covers **both** mutations so a double-click during the notes-save window can't fire duplicate writes.

```tsx
<Button
  variant="outline"
  onClick={handlePutOnHold}
  disabled={
    updateQueue.isPending ||
    updateConsultation.isPending ||
    entry.clinic_status === 'on_hold'
  }
  className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
>
  <PauseCircle className="h-4 w-4 mr-1" /> Put on Hold
</Button>
```

Add `PauseCircle` to the existing `lucide-react` import.

### 3. Footer layout adjustment

The footer's right-hand `<div className="flex gap-2">` becomes `flex flex-wrap gap-2 justify-end` so three buttons wrap gracefully on narrow widths without breaking the sticky layout.

---

### Workflow after change

1. Doctor types notes, realises patient needs to wait (lab results pending, etc.).
2. Clicks **Put on Hold** → button locks immediately (both `isPending` flags), notes save, queue flips to `on_hold`, toast confirms, navigates to `/clinic/consultation`.
3. Patient appears in the **On hold** tab of the queue list.
4. **Resume Patient** there → status returns to `with_doctor`, navigates back to detail page with all notes intact.
5. If either mutation fails → red error toast with the message, button re-enables, doctor can retry without losing their typing.

### Out of scope

- `Consultation.tsx` queue list (already has Resume Patient — no changes).
- `useUpdateQueueEntry`, `useUpdateConsultation`, `StatusBadge`, child components — untouched.
- No DB migration: `on_hold` already exists in `clinic_status` enum.

### Files touched

| File | Action |
|---|---|
| `src/pages/clinic/ConsultationDetail.tsx` | **Edit** — add `handlePutOnHold` (with try/catch), add `PauseCircle` import, insert button in sticky footer with dual-mutation disabled guard, change footer button row to `flex flex-wrap gap-2 justify-end`. |

### Verification

1. `tsc --noEmit` passes.
2. Open a `with_doctor` consultation → footer shows three buttons: Save Draft / Put on Hold / Send to Dispensary.
3. Click **Put on Hold** → button disables instantly (covers the notes-save window); rapid double-click produces only one set of DB writes.
4. On success → toast, redirect, patient visible in **On hold** tab.
5. Simulated failure (e.g. offline) → red error toast `Failed to place on hold: …`, button re-enables, no navigation, typed notes still in the textarea.
6. Resume from queue → returns to detail page, `caseNote` / `diagnosisText` / `dispenseNote` populated, treatment items intact.
7. Front desk's `QueueBoard` shows the on-hold patient as read-only — no regression.

