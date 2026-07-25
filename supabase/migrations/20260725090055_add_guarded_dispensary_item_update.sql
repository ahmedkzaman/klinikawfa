CREATE OR REPLACE FUNCTION public.update_consultation_item_dispensary(
  p_item_id uuid,
  p_consultation_id uuid,
  p_updates jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.can_edit_dispensary_prices(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit dispensary items'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_updates) <> 'object'
     OR p_updates - ARRAY[
       'quantity', 'price', 'price_tier', 'indication', 'dosage_qty',
       'dosage_unit', 'frequency', 'instruction', 'duration', 'precaution'
     ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Unsupported dispensary item fields'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.consultation_items
  SET
    quantity = CASE
      WHEN p_updates ? 'quantity' THEN (p_updates->>'quantity')::numeric
      ELSE quantity
    END,
    price = CASE
      WHEN p_updates ? 'price' THEN (p_updates->>'price')::numeric
      ELSE price
    END,
    price_tier = CASE
      WHEN p_updates ? 'price_tier' THEN p_updates->>'price_tier'
      ELSE price_tier
    END,
    indication = CASE
      WHEN p_updates ? 'indication' THEN p_updates->>'indication'
      ELSE indication
    END,
    dosage_qty = CASE
      WHEN p_updates ? 'dosage_qty'
        THEN NULLIF(p_updates->>'dosage_qty', '')::numeric
      ELSE dosage_qty
    END,
    dosage_unit = CASE
      WHEN p_updates ? 'dosage_unit' THEN p_updates->>'dosage_unit'
      ELSE dosage_unit
    END,
    frequency = CASE
      WHEN p_updates ? 'frequency' THEN p_updates->>'frequency'
      ELSE frequency
    END,
    instruction = CASE
      WHEN p_updates ? 'instruction' THEN p_updates->>'instruction'
      ELSE instruction
    END,
    duration = CASE
      WHEN p_updates ? 'duration' THEN p_updates->>'duration'
      ELSE duration
    END,
    precaution = CASE
      WHEN p_updates ? 'precaution' THEN p_updates->>'precaution'
      ELSE precaution
    END
  WHERE id = p_item_id
    AND consultation_id = p_consultation_id
    AND deleted_at IS NULL
  RETURNING id INTO updated_id;

  IF updated_id IS NULL THEN
    RAISE EXCEPTION 'Active consultation item not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN updated_id;
END
$function$;

ALTER FUNCTION public.update_consultation_item_dispensary(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_consultation_item_dispensary(uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_consultation_item_dispensary(uuid, uuid, jsonb)
  TO authenticated;
