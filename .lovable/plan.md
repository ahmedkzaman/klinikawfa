## Support Non-MyKad Patient Registration (Police, Army, Passport)

Today the form forces every Malaysian patient to enter a 12-digit MyKad. Walk-ins with Police ID, Army (Tentera) ID, or passport-only foreigners fail validation. This plan adds a single `id_type` selector that drives both the label and the validation rules.

---

### 1. Database — add `id_type` column

Migration on `public.patients`:

```sql
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS id_type text NOT NULL DEFAULT 'mykad';

ALTER TABLE public.patients
  ADD CONSTRAINT patients_id_type_check
  CHECK (id_type IN ('mykad','passport','police','army'));
```

No RLS changes. `src/integrations/supabase/types.ts` regenerates automatically.

---

### 2. Validation — `src/components/clinic/patientFormSchema.ts`

- Add `id_type: z.enum(['mykad','passport','police','army']).default('mykad')`.
- Loosen `national_id` to `z.string().trim().max(30).optional()` (drop the strict 12-digit refine on the field itself).
- Keep `passport_no` as today.
- Rewrite the `superRefine`:
  - If `id_type === 'mykad'`: require `national_id` and enforce `/^\d{12}$/` after stripping `-` / spaces. Passport still allowed as alternate (existing "MyKad OR Passport" rule preserved).
  - If `id_type === 'passport'`: require `passport_no` (alphanumeric, ≤20).
  - If `id_type === 'police'` or `'army'`: require `national_id` with `min(5)`, alphanumeric, no digit-count check.

This keeps a single source of truth so all three dialogs inherit the rules.

---

### 3. Register dialogs — `RegisterPatientDialog.tsx` and `RegisterAndCheckInDialog.tsx`

In the demographic section, immediately above the `national_id` input:

- Add a `<Select>` bound to `id_type` (shadcn Select, controlled via `Controller`).
  - Options: MyKad / MyKid, Police ID, Army ID (Tentera), Passport.
- Dynamic label on the ID input driven by `id_type`:
  - `mykad` → "MyKad / IC *", placeholder "12 digits"
  - `police` → "Police ID Number *", placeholder e.g. "RF123456"
  - `army` → "Army ID (Tentera) *", placeholder e.g. "T1234567"
  - `passport` → hide the `national_id` input and show only the existing Passport No. input (or swap the active field).
- `ReadMyKadButton` is only rendered when `id_type === 'mykad'`.
- The MyKad auto-parse effect (DOB/gender from IC) runs only when `id_type === 'mykad'`.
- `usePatientByIc` duplicate-check stays as-is: it self-disables unless the value matches `^\d{12}$`, so non-MyKad IDs simply skip the lookup (acceptable — duplicates for police/army/passport are rare and not in scope).
- `onSubmit` payload includes `id_type: data.id_type`.

`RegisterAndCheckInDialog.tsx` additionally:
- Local zod schema in that file currently duplicates the MyKad regex (line ~74-80) — replace with the shared `patientSchema` import, or mirror the same `id_type` conditional so the two stay in lockstep.
- `handleLoadExisting` already prefills from an existing patient; extend to also set `id_type` from `ep.id_type`.

---

### 4. Edit dialog — `EditPatientDialog.tsx`

- Same `<Select>` for `id_type`, defaulting from `p.id_type ?? 'mykad'`.
- Same dynamic label + conditional render rules.
- `onSubmit` patch includes `id_type`.

---

### Out of scope

- No changes to `PatientProfileSheet`, queue board, consultation, or dispensary display (they read `national_id` / `passport_no` as plain text, which still works).
- No backfill of historic rows — they remain `mykad` by default, matching reality.
- No new duplicate-check lookup for non-MyKad IDs (can be added later if needed).
- No changes to `usePatients` search; it already does `ilike` on `national_id` so police/army IDs are searchable.
