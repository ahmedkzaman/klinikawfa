
## Add Always-Visible "Register New Patient" Button to Walk-In Dialog

**Problem:** The "Register new patient" action is hidden inside `PatientPicker`'s empty-state — only appears after typing a search that returns zero results. Easy to miss.

**Fix:** Surface a clear, always-visible button next to the "Patient *" label inside `CheckInWalkInDialog`, which opens the existing `RegisterPatientDialog`. The wiring already exists (`registerOpen` state + `RegisterPatientDialog` render + `onCreated → setPatient`); we just expose the trigger upfront.

### Change

**`src/components/clinic/CheckInWalkInDialog.tsx`** — modify the "Patient *" label row only:

- Replace the single `<Label>` with a flex row: `<Label>` on the left, a small `<Button variant="link" size="sm">` with a `UserPlus` icon and the text "Register new" on the right.
- Button `onClick` → `setRegisterOpen(true)` (state already declared).
- Hide the button when a patient is already selected (`!patient`) to keep the UI clean during the "Change" flow.

No other files touched. `PatientPicker`'s inline empty-state button stays as a secondary fallback.

### Verification

1. Open Queue Board → Walk-In → dialog shows "Patient *" with "Register new" link-button on the right.
2. Click "Register new" → `RegisterPatientDialog` opens on top.
3. Submit registration → dialog closes, new patient auto-fills into the picker (existing `onCreated` path).
4. Once a patient is selected, the "Register new" button is hidden (picker is in selected/Change state).
