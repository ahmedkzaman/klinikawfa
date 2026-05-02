-- 1. Singleton clinic_settings table
CREATE TABLE public.clinic_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name text NOT NULL DEFAULT 'Klinik Awfa',
  address_line_1 text NOT NULL DEFAULT '',
  address_line_2 text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  content_margin_top integer NOT NULL DEFAULT 120,
  singleton boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_settings_singleton_unique UNIQUE (singleton)
);

-- 2. Clamp trigger for content_margin_top (50..300)
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
  NEW.singleton := true; -- enforce singleton flag
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clinic_settings_validate
BEFORE INSERT OR UPDATE ON public.clinic_settings
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_clinic_settings();

-- 3. Seed the single row
INSERT INTO public.clinic_settings (clinic_name, content_margin_top)
VALUES ('Klinik Awfa', 120);

-- 4. RLS
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read clinic settings"
ON public.clinic_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can update clinic settings"
ON public.clinic_settings
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- No INSERT or DELETE policies → singleton enforced (only the seeded row exists).

-- 5. Storage policies for the existing public 'clinic-assets' bucket
-- Public read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public can read clinic-assets'
  ) THEN
    CREATE POLICY "Public can read clinic-assets"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'clinic-assets');
  END IF;
END $$;

-- Admin write
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can upload clinic-assets'
  ) THEN
    CREATE POLICY "Admins can upload clinic-assets"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'clinic-assets' AND public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can update clinic-assets'
  ) THEN
    CREATE POLICY "Admins can update clinic-assets"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'clinic-assets' AND public.is_admin(auth.uid()))
    WITH CHECK (bucket_id = 'clinic-assets' AND public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins can delete clinic-assets'
  ) THEN
    CREATE POLICY "Admins can delete clinic-assets"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'clinic-assets' AND public.is_admin(auth.uid()));
  END IF;
END $$;