-- Refresh PostgREST's cached RPC signatures after deploying the permissions API.
NOTIFY pgrst, 'reload schema';
