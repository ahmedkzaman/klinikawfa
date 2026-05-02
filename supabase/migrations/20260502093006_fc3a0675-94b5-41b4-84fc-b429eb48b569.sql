ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS logo_height_px integer NOT NULL DEFAULT 64;

CREATE OR REPLACE FUNCTION public.trg_validate_clinic_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.content_margin_top IS NULL OR NEW.content_margin_top < 50 OR NEW.content_margin_top > 300 THEN
    RAISE EXCEPTION 'INVALID_CONTENT_MARGIN_TOP: must be between 50 and 300' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.logo_height_px IS NULL OR NEW.logo_height_px < 24 OR NEW.logo_height_px > 240 THEN
    RAISE EXCEPTION 'INVALID_LOGO_HEIGHT_PX: must be between 24 and 240' USING ERRCODE = 'P0001';
  END IF;
  NEW.singleton := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;