-- RLS policy inventory query (read-only)
--
-- SAFE FOUNDATION ONLY:
-- - This file is not a migration.
-- - It does not alter schema, policies, roles, grants, or data.
-- - It selects from PostgreSQL catalog/system views only.
-- - Run manually only against an explicitly approved local/staging database.
-- - Do NOT run against production unless DocM3d separately approves production read-only inspection.
--
-- Example, after selecting a non-production connection string:
--   psql "$STAGING_DATABASE_URL" -f scripts/dump-pg-policies.sql -o rls-policy-inventory.tsv

\pset format unaligned
\pset fieldsep '\t'
\pset tuples_only off

SELECT
  p.schemaname,
  p.tablename,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check
FROM pg_policies AS p
JOIN pg_class AS c
  ON c.relname = p.tablename
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
 AND n.nspname = p.schemaname
WHERE p.schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd;
