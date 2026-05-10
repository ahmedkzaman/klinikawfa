## "Copy diagnosis to today" — Past Visits timeline

Add a hover-revealed copy action next to each past visit's diagnosis pill in `ConsultationDetail.tsx` so doctors can pull a previous diagnosis into today's consultation in one click. Optimised for chronic follow-up workflow (DM, HTN, asthma).

### Behaviour

**Append-not-overwrite logic** (per-click, on the parent form's diagnosis state):

1. **Today's field is empty** → set the diagnosis to the copied one.
   - If past visit has a structured `diagnoses.id`, set `diagnosisId` (richer, ICD-mappable).
   - Otherwise set `diagnosisText` to the free-text name.
2. **Today's field already has a structured diagnosis** (`diagnosisId` set) → "promote" it: convert current structured name to text, append `", <new>"`, clear `diagnosisId`. (The combobox can't hold two structured ids; falling back to text preserves both labels without losing data.)
3. **Today's field already has free text** → append `", <new>"` to `diagnosisText`.
4. **Duplicate guard** — if the copied name (case-insensitive) is already present in the current field, no-op (still flash the check icon as visual confirmation).

**No auto-save** — only mutates local form state. The doctor must click Save Draft / Save & Dispense as usual. (Matches existing combobox `onChange` behaviour.)

### UI changes (PastVisitCard, lines ~96–131)

- Wrap the diagnosis row (`Stethoscope` + `Badge`) in a `group/diag` flex container.
- Add a `<button>` with `Copy` icon (lucide-react), classes:
  - `opacity-0 group-hover/diag:opacity-100 focus-visible:opacity-100 transition-opacity`
  - `p-1 rounded text-blue-600 hover:bg-blue-100`
  - `title="Copy diagnosis to today's visit"` + `aria-label`
- Local `useState` `copied` flips to `true` on click → swap `Copy` icon for `Check` for 2s via `setTimeout`.
- Mobile fallback: `sm:opacity-0` so the button is always visible on touch devices (`opacity-100 sm:opacity-0 sm:group-hover/diag:opacity-100`).

### Wiring

- Add prop `onCopyDiagnosis?: (payload: { diagnosis_id: string | null; name: string }) => void` to `PastVisitCard`.
- In the parent (`ConsultationDetail`), define `handleCopyDiagnosis` that runs the append logic above against `diagnosisText` / `diagnosisId` setters.
- Extend `PastVisit` interface to include `diagnoses?: { id?: string; name?: string }` (the underlying hook already returns `diagnoses(id, name)`, just not typed).
- Pass `onCopyDiagnosis={handleCopyDiagnosis}` at the existing `<PastVisitCard>` render site (~line 1065).

### Out of scope

- **Clinical notes copy** — intentionally NOT added. Cloning case notes invites medico-legal risk (stale physical-exam findings, copy-paste lawsuits). Notes stay manual. We can revisit if the doctor explicitly requests "copy structure / template" later.
- No DB or hook changes — `useConsultations` already selects `diagnoses(id, name)`.
- No new files — both `Copy` and `Check` come from `lucide-react`.

### File touched

- `src/pages/clinic/ConsultationDetail.tsx` — extend `PastVisit` type, add `handleCopyDiagnosis`, update `PastVisitCard` signature + diagnosis row JSX, pass prop at render site.