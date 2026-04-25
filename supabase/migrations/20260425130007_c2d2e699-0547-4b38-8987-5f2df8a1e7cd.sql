-- Step 17: Deduplicate public.diagnoses
-- A) Backup table (safety net)
CREATE TABLE IF NOT EXISTS public.diagnoses_backup_20260425 AS
  SELECT * FROM public.diagnoses;

-- B) Drop the misaligned unique index that would block the merge
DROP INDEX IF EXISTS public.diagnoses_icd10_search_aliases_uidx;

-- C) Merge & deduplicate
WITH normalized AS (
  SELECT
    id,
    search_aliases,
    lower(trim(name)) AS nkey,
    upper(trim(coalesce(icd10_code, ''))) AS ckey
  FROM public.diagnoses
),
keepers AS (
  SELECT DISTINCT ON (nkey, ckey) id AS keep_id, nkey, ckey
  FROM normalized
  ORDER BY nkey, ckey, id
),
exploded AS (
  SELECT
    n.nkey,
    n.ckey,
    trim(unnest(string_to_array(coalesce(n.search_aliases, ''), ','))) AS alias_raw
  FROM normalized n
),
ci_dedup AS (
  -- case-insensitive de-dup: keep first-seen casing per lower() form
  SELECT DISTINCT ON (nkey, ckey, lower(alias_raw))
    nkey, ckey, alias_raw
  FROM exploded
  WHERE alias_raw <> ''
  ORDER BY nkey, ckey, lower(alias_raw), alias_raw
),
merged AS (
  SELECT
    nkey,
    ckey,
    string_agg(alias_raw, ', ' ORDER BY lower(alias_raw)) AS final_aliases
  FROM ci_dedup
  GROUP BY nkey, ckey
)
UPDATE public.diagnoses d
SET search_aliases = m.final_aliases,
    updated_at = now()
FROM keepers k
JOIN merged m ON m.nkey = k.nkey AND m.ckey = k.ckey
WHERE d.id = k.keep_id;

-- Delete duplicate rows (everything that is not a keeper)
WITH keepers AS (
  SELECT DISTINCT ON (lower(trim(name)), upper(trim(coalesce(icd10_code, ''))))
    id AS keep_id
  FROM public.diagnoses
  ORDER BY lower(trim(name)), upper(trim(coalesce(icd10_code, ''))), id
)
DELETE FROM public.diagnoses d
WHERE d.id NOT IN (SELECT keep_id FROM keepers);

-- D) Add the correct unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS diagnoses_unique_name_icd10_idx
  ON public.diagnoses (lower(trim(name)), upper(trim(coalesce(icd10_code, ''))));