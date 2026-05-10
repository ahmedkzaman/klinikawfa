# Past Visits — Clinical Narrative Upgrade

Turn the doctor-side "Past Visits" panel on `ConsultationDetail.tsx` into a scannable timeline with a prominent diagnosis row and per-card collapsible clinical notes. UI-only — `usePatientConsultationHistory` already returns everything needed.

## What changes

1. **Local `PastVisitCard` component** inside `ConsultationDetail.tsx` (kept inline; only one consumer). Owns its own `useState` for expand/collapse so opening one card doesn't expand the rest.

2. **Timeline rail.** Replace the flat `divide-y` list with a left-border timeline: each card sits on `pl-6 border-l-2 border-slate-100` with a `bg-blue-400` dot at the top-left, giving a visual sense of clinical progression.

3. **Date + doctor header.** Date stays bold; doctor name moves inline ("— Dr. Name") next to it instead of right-aligned, so the eye hits date → diagnosis → note in one column.

4. **Diagnosis prominence.** Show diagnosis directly under the date, prefixed with a small `Stethoscope` icon. Prefer structured `diagnoses.name`; fall back to free-text `diagnosis_text`. Don't render both as duplicate pills.

5. **Collapsible `case_note`.**
   - Default: `line-clamp-2`, `text-slate-500` (desaturated).
   - Expanded: full text, `whitespace-pre-wrap`, `text-slate-800`.
   - Toggle only appears when note is longer than ~120 chars (short notes never need a "Read more" button).
   - Both the note text itself and a "Read full notes / Show less" link toggle the state.

6. **Items list unchanged.** Prescriptions still render below the notes exactly as today, including the qty / dosage / price formatting. Pagination (`HISTORY_PER_PAGE = 5`, prev/next) stays as-is.

7. **Dispense note** (existing) stays as a small block under the case note, unchanged.

## File touched

- `src/pages/clinic/ConsultationDetail.tsx` — replace the inline past-visit `<div>` block (~lines 934–1006) with `<PastVisitCard visit={consult} />`, and add the local `PastVisitCard` component above the page component or in the same module.

## Out of scope

- No data/hook changes. (`usePatientConsultationHistory` already selects `*, diagnoses, doctors, consultation_items`.)
- No edits to `PatientProfileSheet → VisitRow` — it already has expand/collapse and isn't what the doctor sees in the consultation rail.
- No ICD-10 badge — column not currently selected; would require a hook change. Skip unless requested.
- No changes to other right-rail cards (Vitals, Upcoming, etc.).

## Acceptance

- Long case notes collapse to 2 lines on first render, in a desaturated tone.
- Clicking the note text or the "Read full notes" link expands only that single card; "Show less" collapses it back.
- Diagnosis row sits directly under the date with a stethoscope icon.
- Past visits visually form a vertical timeline with a left rail and dots.
- Items list, dispense note, pagination, and empty state are unchanged.
