# Plan: "Load Existing Record" action on duplicate-MyKad warning

## File
`src/components/clinic/RegisterAndCheckInDialog.tsx` (single component)

## Changes

### 1. New state — track loaded existing patient
Add:
```ts
const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
```
Clear it inside the existing `useEffect` that resets the dialog on close, and clear it whenever the IC field is edited away from the loaded patient's IC (watch `nationalId`).

### 2. Handler — load existing record into the form
```ts
const handleLoadExisting = () => {
  if (!existingPatient) return;
  setLoadedPatientId(existingPatient.id);
  reset({
    ...EMPTY,
    national_id: existingPatient.national_id ?? '',
    name: existingPatient.name ?? '',
    phone: existingPatient.phone ?? '',
    gender: (existingPatient.gender as FormData['gender']) ?? '',
    date_of_birth: existingPatient.date_of_birth ?? '',
    email: existingPatient.email ?? '',
    // preserve today's-visit defaults
    visit_type: 'consultation',
    visit_purpose: 'consultation',
    payment_method: existingPatient.default_panel_id ? 'panel' : 'cash',
    panel_id: existingPatient.default_panel_id ?? null,
  });
  // reset() clears RHF errors automatically
  toast.success(`Loaded existing patient: ${existingPatient.name}`);
};
```
`reset()` wipes the red validation messages — satisfies the "clear errors" requirement.

### 3. UI — add Button inside the duplicate Alert (around line 419)
Inside the existing `<Alert variant="destructive">` block, after the warning text add:
```tsx
<Button
  type="button"
  size="sm"
  variant="secondary"
  onClick={handleLoadExisting}
  className="mt-1"
>
  <UserCheck className="h-4 w-4" />
  Load Existing Record
</Button>
```
Import `UserCheck` from `lucide-react`. Hide the button (or disable it) when `loadedPatientId === existingPatient.id` and show a small "Loaded ✓" hint instead.

### 4. Bypass create on submit
In `onSubmit`, replace the unconditional `createPatient.mutateAsync(...)` with:
```ts
let patient: { id: string };
if (loadedPatientId && loadedPatientId === existingPatient?.id) {
  patient = { id: loadedPatientId };
} else {
  patient = await createPatient.mutateAsync({ ...existing payload... });
}
```
Everything downstream (queue_entries insert, navigation) uses `patient.id` as today, so no other changes are needed.

### 5. Visual cue (small)
When `loadedPatientId` is set, render a muted badge under the IC field: "Using existing record — submit will only create the queue entry." This signals the workflow change to the nurse.

## Out of scope
- No DB / RLS / schema changes.
- No changes to `usePatientByIc`, `useCreatePatient`, or queue logic.
- Dependant-linkage and panel sections untouched.

## Acceptance criteria
- Typing a duplicate 12-digit IC shows the red alert with a "Load Existing Record" button.
- Clicking it auto-fills Name / Phone / Gender / DOB / Email, clears all red field errors, and prefills the default panel if any.
- Submitting then skips the patient insert and only creates the `queue_entries` row, routing to /clinic/queue (or /clinic/dispensary for direct sale).
- Editing the IC after loading clears the loaded state so a fresh create can happen.
- Closing the dialog resets everything including `loadedPatientId`.
