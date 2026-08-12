-- SQLSTATE 40001 tells PostgREST that the transaction should be retried. That
-- is appropriate for serialization failures, but not for an editor's stale
-- revision: PostgREST retries the publish until the request times out. Convert
-- every website-CMS stale revision guard to PostgREST's explicit HTTP 409 code.
DO $migration$
DECLARE
  v_function record;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ILIKE '%stale website%'
      AND pg_get_functiondef(p.oid) LIKE '%40001%'
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := regexp_replace(
      v_definition,
      'ERRCODE\s*=\s*''40001''',
      'ERRCODE = ''PT409''',
      'gi'
    );
    EXECUTE v_definition;
  END LOOP;
END
$migration$;
