## Add "Read MyKad" button to RegisterAndCheckInDialog

### Target
`src/components/clinic/RegisterAndCheckInDialog.tsx`

### 1. Imports
Add `ReadMyKadButton`, `cleanIC`, `mapGender`, `mapDOB` from `@/components/clinic/ReadMyKadButton`.

### 2. UI placement
In the demographics card's ID field row, render `ReadMyKadButton` on the right side of the label. Only show when `id_type === 'mykad'`.

### 3. onRead handler (hardened against state collision)
Before any `setValue` calls, clear the loaded-patient state:
- `setLoadedPatientId(null)`
- `setLoadedIc(null)`

Then populate:
- `name` → `toMalayTitleCase(data.name)`
- `id_type` → `'mykad'`
- `national_id` → `cleanIC(data.ic_no)`
- `date_of_birth` → `mapDOB(data.dob)`
- `gender` → `mapGender(data.gender)`

All `setValue` calls use `{ shouldValidate: true, shouldDirty: true }`.

### 4. Feedback
`toast.success('MyKad read successfully')` after population.

### Constraints
- No PDPA consent checkbox (implied consent at counter).
- Reuse existing `ReadMyKadButton` / `useMyKadReader` — no new hook.
- No schema or migration changes.
