-- DEFERRED: execute as a new Supabase migration no earlier than
-- 2026-08-20 18:00 Asia/Kuala_Lumpur, after confirming cached pre-release
-- clients are no longer active. Do not add this file to supabase/migrations
-- for the current release.
-- Command at that time:
--   npx.cmd supabase migration new revoke_direct_payment_writes
-- Copy the statements below into the generated migration, review, dry-run,
-- then deploy through the normal release workflow.
REVOKE INSERT, UPDATE ON TABLE public.payments FROM authenticated;
