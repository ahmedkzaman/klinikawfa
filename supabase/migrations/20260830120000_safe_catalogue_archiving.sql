-- Catalogue entries are retained for historical billing and archived for future use.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Remove legacy permissive DELETE policies so catalogue rows cannot be physically deleted.
DO $do$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('inventory_items', 'services', 'packages')
      AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.archive_catalogue_entry(
  p_catalogue_type text,
  p_entry_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_archived_at timestamptz;
  v_name text;
BEGIN
  IF NOT (public.is_special_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_entry_id IS NULL OR p_catalogue_type NOT IN ('inventory_item', 'service', 'package') THEN
    RAISE EXCEPTION 'INVALID_CATALOGUE_ENTRY' USING ERRCODE = '22023';
  END IF;

  IF p_catalogue_type = 'inventory_item' THEN
    UPDATE public.inventory_items
    SET status = 'inactive', archived_at = COALESCE(archived_at, now()), updated_at = now()
    WHERE id = p_entry_id AND archived_at IS NULL
    RETURNING name, archived_at INTO v_name, v_archived_at;
  ELSIF p_catalogue_type = 'service' THEN
    UPDATE public.services
    SET status = 'inactive', archived_at = COALESCE(archived_at, now())
    WHERE id = p_entry_id AND archived_at IS NULL
    RETURNING name, archived_at INTO v_name, v_archived_at;
  ELSE
    UPDATE public.packages
    SET status = 'inactive', archived_at = COALESCE(archived_at, now())
    WHERE id = p_entry_id AND archived_at IS NULL
    RETURNING name, archived_at INTO v_name, v_archived_at;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGUE_ENTRY_NOT_FOUND_OR_ALREADY_ARCHIVED' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', p_entry_id, 'catalogue_type', p_catalogue_type,
    'name', v_name, 'status', 'inactive', 'archived_at', v_archived_at);
END;
$function$;

ALTER FUNCTION public.archive_catalogue_entry(text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_catalogue_entry(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_catalogue_entry(text, uuid) TO authenticated;
