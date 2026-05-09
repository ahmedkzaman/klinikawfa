## Goal

1. Add an Edit Patient dialog to fix data-entry errors, opened from the patient profile sheet.
2. Add a reusable "💳 Read MyKad" button (shared by Register and Edit) that calls a local hardware bridge to auto-fill demographics, with safe parsers for IC and gender.

Address fields are explicitly out of scope.

## Changes

### 1. Shared schema — `src/components/clinic/patientFormSchema.ts` (new)

- Move `patientSchema`, `RELIGIONS`, `PHONE_REGEX`, and `PatientFormData` out of `RegisterPatientDialog`.
- Refactor `RegisterPatientDialog` to import from this module — no behavior change.

### 2. MyKad reader hook — `src/hooks/clinic/useMyKadReader.ts` (new)

- Exposes `{ readMyKad, isReading }`.
- Fetches `import.meta.env.VITE_MYKAD_BRIDGE_URL || 'http://127.0.0.1:8080/api/read-mykad'` with `AbortSignal.timeout(8000)`.
- Returns parsed JSON `{ name?, ic_number?, dob?, gender?, address? }` on 2xx.
- On any failure (network error, non-2xx, timeout, JSON parse): `toast.error("Could not connect to IC Reader. Ensure the bridge software is running.")` → returns `null`.

### 3. Reusable button — `src/components/clinic/ReadMyKadButton.tsx` (new)

- Props: `onRead(data)`, optional `size`/`variant`.
- Renders `💳 Read MyKad`; swaps to `<Loader2 className="animate-spin" />` while `isReading`. Disabled while reading.

### 4. Shared MyKad mapping helpers — colocated in `ReadMyKadButton.tsx` (exported)

- `cleanIC(raw)`: strips all non-digit characters → `"880101-14-5555"` becomes `"880101145555"`.
- `mapGender(raw)`:
  ```ts
  const n = (raw ?? '').toLowerCase().trim();
  if (['lelaki', 'l', 'male', 'm'].includes(n)) return 'male';
  if (['perempuan', 'p', 'female', 'f'].includes(n)) return 'female';
  return undefined; // skip setValue → user picks manually
  ```
- `mapDOB(raw)`: passes through ISO `yyyy-mm-dd`; if MyKad returns `dd/mm/yyyy` or `ddmmyyyy`, normalize to ISO. Returns `undefined` if unparseable.
- Both Register and Edit dialogs use these helpers in their `onRead` mappers — guarantees identical behavior.

### 5. `useUpdatePatient` — append to `src/hooks/clinic/usePatients.ts`

- `mutateAsync({ id, patch })` → `supabase.from('patients').update(patch).eq('id', id).select().single()`.
- On success, invalidates `['clinic', 'patients']`.

### 6. `EditPatientDialog` — `src/components/clinic/EditPatientDialog.tsx` (new)

- Same fields and shared Zod schema as Register.
- Props: `{ open, onOpenChange, patient: PatientRow, onUpdated?: (p: PatientRow) => void }`.
- `useEffect` watching `patient?.id` resets the form to the patient's current values.
- `<ReadMyKadButton onRead={...}>` next to the MyKad input; mapper uses `cleanIC` / `mapGender` / `mapDOB` and calls `setValue(..., { shouldValidate: true, shouldDirty: true })`. Skips fields whose mappers return `undefined`.
- On submit: `useUpdatePatient`, `toast.success("Patient updated: {name}")`, close dialog, fire `onUpdated(updated)`.

### 7. Wire `RegisterPatientDialog`

- Add `<ReadMyKadButton>` next to MyKad input using the same shared mapping helpers.

### 8. Wire `PatientProfileSheet` (stale-state fix)

- Add an `Edit` (pencil icon) button in the `SheetHeader`.
- Local state `const [currentPatient, setCurrentPatient] = useState(patient)` synced via `useEffect` on `patient?.id`.
- Render demographics from `currentPatient` (visit history hook still keyed by stable `patient.id`).
- Mount `<EditPatientDialog patient={currentPatient} onUpdated={setCurrentPatient} ... />` so the open sheet updates instantly.

## Verification

1. Open profile sheet → Edit → form pre-filled → change phone → Save → toast fires, sheet header/details update in place without closing, patients list also refreshes.
2. With no bridge: click 💳 Read MyKad → spinner → ~8s timeout toast `"Could not connect to IC Reader…"`.
3. Mock bridge `{ "name": "Ali", "ic_number": "880101-14-5555", "dob": "1988-01-01", "gender": "Lelaki" }` → fields populate with `national_id = "880101145555"` (no dash), `gender = "male"`, no validation errors.
4. Mock bridge with `gender: "Perempuan"` → maps to `female`. Mock with `gender: "X"` → gender field left untouched.

## Out of scope

- Address columns and UI (deferred).
- Bridge software itself (separate Python/C# service for the Iris SCR51u).