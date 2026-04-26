# Step 35 — Lock Completed Consultations from Re-Dispensing

Once a visit reaches `completed` status (consultation completed or queue checked out), the consultation page must become read-mostly: only clinical documentation may be patched, and the dispensary/hold workflows must be inaccessible.

## File: `src/pages/clinic/ConsultationDetail.tsx`

### A. Derived lock state

Add a derived constant near the top of the component (after `consultation` and `entry` are resolved, around line ~95):

```tsx
const isLocked =
  consultation?.status === 'completed' ||
  entry?.clinic_status === 'completed';
```

### B. Completion banner

Add `CheckCircle2` to the `lucide-react` import block, and import `Alert`/`AlertDescription` from `@/components/ui/alert`.

Render the banner inside the main workspace column, **above** the existing `ConsultationLockBanner` block (around line ~509), so it sits at the top of the right pane on desktop and first on mobile:

```tsx
{isLocked && (
  <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    <AlertDescription>
      This consultation is completed. Changes are limited to clinical
      documentation only.
    </AlertDescription>
  </Alert>
)}
```

### C. New handler — clinical-notes-only patch

Add alongside the existing handlers (near `handleSaveNotes`, ~line 233). It intentionally omits `dispense_note` and any status mutation:

```tsx
const handleUpdateClinicalNotes = async () => {
  if (!consultationId) {
    toast.error('Consultation not found');
    return;
  }
  await updateConsultation.mutateAsync({
    id: consultationId,
    case_note: caseNote,
    diagnosis_id: diagnosisId,
    diagnosis_text: diagnosisText,
  });
  toast.success('Clinical notes updated');
};
```

### D. Safety guards on existing handlers

Prepend early returns to both `handleSendToDispensary` (line 329) and `handlePutOnHold` (line 349):

```tsx
if (isLocked) {
  toast.error('This consultation is completed and cannot be modified');
  return;
}
```

### E. Action footer transformation (lines ~662–690)

- **Save Draft button**: when `isLocked`, swap label to **"Update Clinical Notes"** and route `onClick` to `handleUpdateClinicalNotes` instead of `handleSaveNotes`.
- **Put on Hold button**: wrap in `{!isLocked && (...)}` so it disappears entirely when locked.
- **Send to Dispensary button**: wrap in `{!isLocked && (...)}` likewise.

```tsx
<Button
  variant="outline"
  onClick={isLocked ? handleUpdateClinicalNotes : handleSaveNotes}
  disabled={updateConsultation.isPending}
  className="rounded-xl"
>
  <Save className="h-4 w-4 mr-1" />
  {isLocked ? 'Update Clinical Notes' : 'Save Draft'}
</Button>

{!isLocked && (
  <>
    <Button onClick={handlePutOnHold} ...>...</Button>
    <Button onClick={handleSendToDispensary} ...>...</Button>
  </>
)}
```

## Out of scope

- No DB schema or RLS changes — `consultations.status` and `queue_entries.clinic_status` already exist and are correctly written by Step 33's checkout flow.
- No changes to the dispense cart hook (`useConsultationLock`) — its `isCompleted` check already disables editing of treatment items when the consultation is completed.
- No changes to `RecordPaymentDialog` — Step 33 already drives the transition to `completed`.

## Files modified

- `src/pages/clinic/ConsultationDetail.tsx` (imports, derived `isLocked`, new handler, guards on two handlers, banner render, footer conditional rendering)
