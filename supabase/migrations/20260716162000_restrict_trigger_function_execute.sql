-- Trigger functions are invoked by their registered triggers, not as public
-- RPC endpoints. Remove the default client EXECUTE grant without changing
-- function ownership, definitions, trigger bindings, or runtime behavior.

BEGIN;

DO $revoke$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype = 'trigger'::regtype
     ORDER BY (p.oid::regprocedure)::text
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
  END LOOP;
END
$revoke$;

DO $postflight$
DECLARE
  exposed_count integer;
BEGIN
  SELECT count(*) INTO exposed_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prorettype = 'trigger'::regtype
     AND (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );

  IF exposed_count <> 0 THEN
    RAISE EXCEPTION 'trigger-function postflight failed: % client-executable trigger function(s) remain', exposed_count;
  END IF;
END
$postflight$;

COMMIT;
