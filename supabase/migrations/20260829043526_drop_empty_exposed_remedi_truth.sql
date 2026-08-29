-- Remove an empty, untracked scratch table that was found in the exposed
-- public schema during the Remedi production postflight security scan.
--
-- Fail closed if the object has acquired data, changed shape, or gained a
-- dependency. DROP TABLE intentionally omits CASCADE.
DO $cleanup$
DECLARE
  v_columns text[];
  v_row_count bigint;
BEGIN
  IF to_regclass('public.remedi_truth') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'remedi_truth'
      AND relation.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'REMEDI_TRUTH_UNEXPECTED_OBJECT_TYPE';
  END IF;

  SELECT pg_catalog.array_agg(
           attribute.attname || ':' ||
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
           ORDER BY attribute.attnum
         )
    INTO v_columns
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.remedi_truth'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF v_columns IS DISTINCT FROM ARRAY[
    'patient:text',
    'national_id:text',
    'visit_date:date',
    'total:numeric'
  ]::text[] THEN
    RAISE EXCEPTION 'REMEDI_TRUTH_UNEXPECTED_COLUMNS: %', v_columns;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.remedi_truth' INTO v_row_count;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'REMEDI_TRUTH_NOT_EMPTY: % rows', v_row_count;
  END IF;

  EXECUTE 'DROP TABLE public.remedi_truth';
END;
$cleanup$;
