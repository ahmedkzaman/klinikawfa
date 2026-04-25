## Step 16.75 — Diagnosis Search Aliases

### Goal
Allow doctors to search diagnoses using colloquial GP shorthand (e.g., "URTI") without polluting the formal ICD-10 display name.

### Changes

**A. Database Migration**
- Add `search_aliases` column (`text` type) to `public.diagnoses` table.

**B. Hook & Type Updates (`src/hooks/clinic/useDiagnoses.ts`)**
- Add `search_aliases?: string | null` to the local `DiagnosisRow` type.
- Update `SELECT_COLS` and all three `.select(...)` calls to include `search_aliases`.

**C. Combobox Search Logic (`src/components/clinic/consultation/DiagnosisCombobox.tsx`)**
- Extend the `filtered` `useMemo` block to also match against `d.search_aliases` with case-insensitive `.includes(q)`.

### Notes
- The Supabase `types.ts` file will auto-update after migration deploys; we do NOT manually edit it.
- No changes to the DiagnosisSweeper or Settings hub are required for this step.
- The `exactMatch` check remains name-only (aliases are for search, not for equality).
