ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS letterhead_text_px integer NOT NULL DEFAULT 12;

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
  IF NEW.letterhead_text_px IS NULL OR NEW.letterhead_text_px < 8 OR NEW.letterhead_text_px > 32 THEN
    RAISE EXCEPTION 'INVALID_LETTERHEAD_TEXT_PX: must be between 8 and 32' USING ERRCODE = 'P0001';
  END IF;
  NEW.singleton := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;