CREATE OR REPLACE FUNCTION public.remove_consultation_item_dispensary(
  p_item_id uuid,
  p_consultation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.can_edit_dispensary_prices(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to remove dispensary items'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.consultation_items
  SET
    deleted_at = now(),
    deleted_by = auth.uid()
  WHERE id = p_item_id
    AND consultation_id = p_consultation_id
    AND deleted_at IS NULL
  RETURNING id INTO removed_id;

  IF removed_id IS NULL THEN
    RAISE EXCEPTION 'Active consultation item not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN removed_id;
END
$function$;

ALTER FUNCTION public.remove_consultation_item_dispensary(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_consultation_item_dispensary(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_consultation_item_dispensary(uuid, uuid)
  TO authenticated;
