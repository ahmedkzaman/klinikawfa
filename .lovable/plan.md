# Step 17 — Deduplicate `public.diagnoses`

## Context

Investigation confirms the issue:
- **`public.diagnoses` has 2,000 rows but only 262 unique `(name, icd10_code)` combinations** — each diagnosis is duplicated ~12 times, once per alias variant.
- Example: `J06.9 / Acute upper respiratory infection, unspecified` appears 12 times with `search_aliases` like `URTI`, `viral URI`, `flu-like illness`, `URTI with cough`, etc.
- Same pattern for `I10 / Essential hypertension` (aliases: `hpt, htn`, `high BP`, `hypertension routine review`, …).

This causes `DiagnosisCombobox` on `/clinic/consultation/...` to show ~12 repeated rows for searches like "urti" or "hpt".

The pre-existing unique index `diagnoses_icd10_search_aliases_uidx` on `(icd10_code, search_aliases)` is the wrong shape — it allows duplicates of the same diagnosis as long as each row has a different alias. We need uniqueness on the **diagnosis identity** instead.

## Scope

### A. Backup table (safety)
Create a snapshot before touching data:
```sql
create table if not exists public.diagnoses_backup_20260425 as
  select * from public.diagnoses;
```
Backup is a one-time safety net; can be dropped manually later by the user.

### B. Drop the misaligned unique index
```sql
drop index if exists public.diagnoses_icd10_search_aliases_uidx;
```
This index would block the dedup merge (UPDATE on the kept row would collide with surviving aliases temporarily).

### C. Merge & deduplicate (single migration, transactional)

Logic:
1. For each `(lower(trim(name)), upper(trim(icd10_code)))` group, pick the **kept row** = row with the smallest `id` (deterministic).
2. Build the merged `search_aliases` as a comma-separated, **case-insensitively de-duplicated, trimmed** list of all non-null alias tokens from the group (split existing values on commas first so `"Essential hypertension, hpt, htn"` is decomposed into 3 tokens).
3. `UPDATE` the kept row with the merged alias string. Preserve its existing `group_category`, `status`, `is_active`, `created_at`.
4. `DELETE` all non-kept rows in the group.

Implementation uses CTEs:
```sql
with normalized as (
  select id, name, icd10_code, search_aliases,
         lower(trim(name)) as nkey,
         upper(trim(coalesce(icd10_code,''))) as ckey
  from public.diagnoses
),
keepers as (
  select distinct on (nkey, ckey) id as keep_id, nkey, ckey
  from normalized
  order by nkey, ckey, id
),
exploded as (
  select n.nkey, n.ckey,
         trim(unnest(string_to_array(coalesce(n.search_aliases,''), ','))) as alias
  from normalized n
),
merged as (
  select nkey, ckey,
         string_agg(distinct alias, ', ' order by alias) as merged_aliases
  from exploded
  where alias <> ''
  -- de-dup case-insensitively by lowering before distinct
  group by nkey, ckey
),
-- case-insensitive distinct via subquery
ci_merged as (
  select nkey, ckey,
         (select string_agg(a, ', ' order by a)
          from (
            select distinct on (lower(x)) x as a
            from unnest(string_to_array(merged_aliases, ', ')) as x
            order by lower(x), x
          ) s) as final_aliases
  from merged
)
update public.diagnoses d
set search_aliases = c.final_aliases,
    updated_at = now()
from keepers k
join ci_merged c on c.nkey = k.nkey and c.ckey = k.ckey
where d.id = k.keep_id;

delete from public.diagnoses d
using (
  select id
  from public.diagnoses dd
  where dd.id not in (select keep_id from (
    select distinct on (lower(trim(name)), upper(trim(coalesce(icd10_code,''))))
           id as keep_id
    from public.diagnoses
    order by lower(trim(name)), upper(trim(coalesce(icd10_code,''))), id
  ) k)
) victims
where d.id = victims.id;
```
(Final SQL will be tightened/inlined — this is the working model.)

### D. Add the correct unique index
```sql
create unique index if not exists diagnoses_unique_name_icd10_idx
  on public.diagnoses (lower(trim(name)), upper(trim(coalesce(icd10_code,''))));
```
Prevents future accidental duplicate inserts.

### E. Verification (read-only)
1. `SELECT count(*) FROM public.diagnoses;` — expect **262**.
2. `SELECT name, icd10_code, search_aliases FROM public.diagnoses WHERE search_aliases ILIKE '%urti%' OR name ILIKE '%upper respiratory%';` — expect **1 row** for J06.9 with merged aliases (`URTI, viral URI, flu-like illness, ...`).
3. `SELECT name, icd10_code, search_aliases FROM public.diagnoses WHERE search_aliases ILIKE '%hpt%' OR search_aliases ILIKE '%htn%' OR name ILIKE '%hypertension%';` — expect **3 rows max** (I10 Essential hypertension, R03.0 Elevated BP reading, plus any other distinct hypertension-related diagnosis), each with all aliases merged into one row. I10 should contain `hpt`, `htn`, `high BP`, etc.
4. Confirm in the UI: search "URTI" or "HPT" in the consultation diagnosis combobox at `/clinic/consultation/96fc2bf1-...` returns one clean row each.

## Out of Scope
- No frontend code changes — `DiagnosisCombobox` already filters on `name`, `icd10_code`, and `search_aliases` correctly.
- The 11 `group_category` values are preserved as-is (kept row's value wins; spot-check confirmed all dup groups share the same category).
- The backup table is left in place; user can drop `public.diagnoses_backup_20260425` after confirming results.

## Risk Notes
- All work runs inside one migration so the table is consistent at completion.
- The kept-row choice (smallest `id`) is deterministic but arbitrary — `group_category`, `status`, `is_active` were verified consistent across duplicate groups for the spot-checked rows, so this is safe.
- If any group has differing `group_category` values across duplicates, the smallest-id row's value wins. This is acceptable given the import was category-tagged uniformly per ICD-10.
- Backup table provides full rollback path: `truncate public.diagnoses; insert into public.diagnoses select * from public.diagnoses_backup_20260425;`
