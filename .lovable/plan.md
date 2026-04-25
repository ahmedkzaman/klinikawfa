## Scope

Synchronize the `CATEGORIES` constant in `src/pages/clinic/settings/DiagnosisSweeper.tsx` with the 11 categories used in the recent `gp_icd10_full_import.sql` import. This ensures the 2,000 pre-categorized rows are excluded from the Sweeper queue.

## A. Update `src/pages/clinic/settings/DiagnosisSweeper.tsx`

Replace the existing 13-item `CATEGORIES` array (lines 32–46) with the 11 synchronized strings, preserving the curly apostrophe (`’`) in `Women’s Health / Reproductive` to byte-match the SQL import:

```ts
const CATEGORIES = [
  'Cardiometabolic / Endocrine',
  'Dermatology',
  'Eye',
  'Gastrointestinal',
  'Musculoskeletal / Injury',
  'Neurology / Mental Health / General',
  'Pediatrics / Infectious',
  'Preventive / Administrative',
  'Respiratory / ENT',
  'Urology / Renal',
  'Women’s Health / Reproductive',
];
```

No other code in the file changes — the dropdown, mutation, and table logic continue to operate against the new list automatically.

## B. Verification of `useUncategorizedDiagnoses`

No code change required. The existing filter in `src/hooks/clinic/useDiagnoses.ts` is:

```ts
.or('group_category.is.null,group_category.eq.,group_category.eq.Uncategorized')
```

Because the 2,000 imported rows have `group_category` set to one of the 11 master strings (none of which are `null`, empty, or `'Uncategorized'`), they are already excluded from the Sweeper. The new `CATEGORIES` constant only governs the dropdown choices presented when sweeping new raw entries — it does not affect the query.

## Compile Check

Run `npx tsc --noEmit` after the edit and report results. No migrations, no new files, no other surface area touched.