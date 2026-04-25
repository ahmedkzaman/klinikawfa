# Step 16.95 (Scope D) — Import 2,000 GP ICD-10 Diagnoses

## Context
The `public.diagnoses` table is currently empty (0 rows), which is why searching "HPT" in the consultation diagnosis combobox returns no results. The user has uploaded a 2,107-line SQL file containing the full GP quicklist with `name`, `icd10_code`, `group_category`, and `search_aliases` (GP shorthand like HPT, HTN, URTI, DM).

## Scope

### A. Register the migration file
- Copy `user-uploads://20260425_import_gp_icd10_diagnoses.sql` to `supabase/migrations/20260425_import_gp_icd10_diagnoses.sql` so it runs as part of the standard Supabase migration pipeline.
- The file is idempotent: it uses `create table if not exists`, `add column if not exists`, a unique index on `(icd10_code, search_aliases)` for dedup, and an RLS policy guard via `pg_policies` lookup. Re-running is safe.

### B. Apply the migration
- Execute the migration through the Supabase migration tool so the 2,000 INSERT rows land in `public.diagnoses`.

### C. Verify the import
Run two read-only checks via `supabase--read_query`:
1. `SELECT COUNT(*) FROM public.diagnoses;` — expect ~2,000.
2. `SELECT name, icd10_code, search_aliases FROM public.diagnoses WHERE search_aliases ILIKE '%HPT%';` — expect "Essential hypertension" (I10) to appear.

### D. Functional confirmation
- Confirm to the user that the existing `DiagnosisCombobox` search logic (already wired in Scope B to match against `name`, `icd10_code`, and `search_aliases`) will now return results for "HPT", "HTN", "URTI", "DM", etc., on `/clinic/consultation/...`.

## Out of Scope
- No frontend code changes — Scopes A, B, C of Step 16.75 already handle the type, hook, and combobox wiring.
- No category re-sync needed — the SQL uses the same 11-category taxonomy already aligned in `DiagnosisSweeper.tsx`.

## Risk Notes
- The unique index `(icd10_code, search_aliases)` enforces dedup; if any pair is non-unique within the SQL itself, those rows will collide. We will surface any error from the migration runner.
- RLS is enabled with a public read policy for active rows — consistent with what the combobox needs (anon/auth read).
