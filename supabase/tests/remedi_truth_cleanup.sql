-- Post-migration security invariant: the stray public Remedi scratch table
-- must not exist in the exposed Data API schema.
DO $test$
BEGIN
  IF to_regclass('public.remedi_truth') IS NOT NULL THEN
    RAISE EXCEPTION 'REMEDI_TRUTH_PUBLIC_TABLE_STILL_EXISTS';
  END IF;
END;
$test$;
