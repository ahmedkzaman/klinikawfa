

## Patient Profile Sheet — Final Plan (with PostgREST array handling)

Adds a right-side drawer to `PatientsList` showing demographics + last 10 visits, with a clean handoff to the existing walk-in check-in flow (pre-filled patient).

---

### 1. New hook — `src/hooks/patients/usePatientVisitHistory.ts`

```ts
useQuery(['clinic','patient-visit-history', patientId], …)
  enabled: !!patientId
  staleTime: 30_000
```

Left-join `queue_entries` → `consultations` → `doctors` so visits without a started consultation still surface:

```ts
supabase
  .from('queue_entries')
  .select(`
    id, created_at, queue_number, clinic_status, visit_notes,
    consultations:consultations!consultations_queue_entry_id_fkey (
      id, doctor_id, diagnosis_text, case_note,
      doctors:doctor_id ( id, name )
    )
  `)
  .eq('patient_id', patientId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(10);
```

Exports `PatientVisitHistoryRow`. `consultations` is typed as the joined object **or array** (PostgREST returns an array because the FK lives on `consultations`).

### 2. New component — `src/components/patients/PatientProfileSheet.tsx`

Props:
```ts
{ patient: PatientRow | null; isOpen: boolean; onClose: () => void; onRegisterVisit: (p: PatientRow) => void; }
```

Layout: shadcn `Sheet`, `side="right"`, content `className="w-full sm:max-w-lg flex flex-col"`.

- **Header**: `SheetTitle` = `patient.name`; `SheetDescription` = `IC: {patient.national_id ?? '—'}`.
- **Details grid** (2-col, `text-sm`): Phone, DOB (`format(..., 'd MMM yyyy')` with null guard), Gender (capitalised), Registered.
- **Visit history**: heading "Recent visits" + count badge. Loading → 3 skeletons. Empty → muted "No visits yet." Otherwise stack of cards.

**Inside the `.map()` — mandatory PostgREST array safety:**
```ts
const consultation = Array.isArray(row.consultations)
  ? row.consultations[0]
  : row.consultations;
const doctorName = consultation?.doctors?.name ?? '—';
const notes = row.visit_notes || consultation?.case_note || consultation?.diagnosis_text;
```

Each card renders:
- Top line: `format(row.created_at, 'd MMM yyyy, h:mma')` · `#${row.queue_number}` · `<StatusBadge status={row.clinic_status} />`.
- Sub-line: `Dr. {doctorName}`.
- Snippet: `{notes}` with `line-clamp-2`. Hidden when falsy.

**Footer**: pinned `<Button>` "Register new visit". `onClick` fires `onClose(); onRegisterVisit(patient);` synchronously. **No `CheckInWalkInDialog` rendered inside this component.**

### 3. Extend `src/components/clinic/CheckInWalkInDialog.tsx`

Add optional prop `initialPatient?: PatientRow | null`. `useEffect` keyed on `[open, initialPatient]`: when dialog opens with a value, `setPatient(initialPatient)`. Existing `reset()` on close still clears state. No other behaviour changes.

### 4. Wire up `src/pages/clinic/PatientsList.tsx`

New state:
```ts
const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
const [sheetOpen, setSheetOpen] = useState(false);
const [checkInOpen, setCheckInOpen] = useState(false);
const [prefillPatient, setPrefillPatient] = useState<PatientRow | null>(null);
```

- Replace stub `toast('Patient profile drill-down — Step 6')` with `setSelectedPatient(p); setSheetOpen(true);`.
- Render `PatientProfileSheet` and `CheckInWalkInDialog` as **siblings** (separate Radix portals → no stacking conflicts):
  ```tsx
  <PatientProfileSheet
    patient={selectedPatient}
    isOpen={sheetOpen}
    onClose={() => setSheetOpen(false)}
    onRegisterVisit={(p) => { setPrefillPatient(p); setCheckInOpen(true); }}
  />
  <CheckInWalkInDialog
    open={checkInOpen}
    onOpenChange={(o) => { setCheckInOpen(o); if (!o) setPrefillPatient(null); }}
    initialPatient={prefillPatient}
  />
  ```
- `RegisterPatientDialog` block untouched.

---

### File checklist

| File | Action |
|---|---|
| `src/hooks/patients/usePatientVisitHistory.ts` | **Create** |
| `src/components/patients/PatientProfileSheet.tsx` | **Create** (with array-safe extraction) |
| `src/components/clinic/CheckInWalkInDialog.tsx` | **Edit** — add `initialPatient` + seed effect |
| `src/pages/clinic/PatientsList.tsx` | **Edit** — selection state, sibling Sheet + Dialog |

### Verification

1. `tsc --noEmit` passes.
2. "View profile" opens sheet with demographics; visit list loads (skeleton → data / empty).
3. Visits with **no consultation row** still render — doctor `'—'`, `visit_notes` snippet only.
4. Visits with consultation render `Dr. {name}` and prefer `visit_notes`, falling back to `case_note` / `diagnosis_text`.
5. Array-safety verified: no runtime errors from `consultations` being an array; no direct `row.consultations?.doctors?.name` access anywhere.
6. "Register new visit" closes sheet, opens check-in dialog with patient pre-selected in `PatientPicker`. Submitting works; cancelling clears `prefillPatient`.
7. Switching between patients re-runs the query (key includes `patientId`); no stale data.
8. No Radix nested-dialog / focus-trap warnings in console.

