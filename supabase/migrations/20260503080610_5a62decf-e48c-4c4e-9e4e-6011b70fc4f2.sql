-- 1) Drop old restrictive constraints
ALTER TABLE public.punch_buffer_settings DROP CONSTRAINT IF EXISTS punch_buffer_role_chk;
ALTER TABLE public.punch_buffer_settings DROP CONSTRAINT IF EXISTS punch_buffer_scope_chk;

-- 2) Add shift_key column
ALTER TABLE public.punch_buffer_settings
  ADD COLUMN IF NOT EXISTS shift_key text;

-- 3) Allow new scopes
ALTER TABLE public.punch_buffer_settings
  ADD CONSTRAINT punch_buffer_scope_chk
  CHECK (scope IN ('global','role','shift','role_shift'));

-- 4) Drop any existing unique constraints on the table
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.punch_buffer_settings'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.punch_buffer_settings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.punch_buffer_settings_scope_global_uniq;
DROP INDEX IF EXISTS public.punch_buffer_settings_scope_role_uniq;

-- 5) New uniqueness rules per scope
CREATE UNIQUE INDEX IF NOT EXISTS punch_buffer_settings_global_uniq
  ON public.punch_buffer_settings ((1)) WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS punch_buffer_settings_role_uniq
  ON public.punch_buffer_settings (role)
  WHERE scope = 'role' AND role IS NOT NULL AND shift_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS punch_buffer_settings_shift_uniq
  ON public.punch_buffer_settings (shift_key)
  WHERE scope = 'shift' AND shift_key IS NOT NULL AND role IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS punch_buffer_settings_role_shift_uniq
  ON public.punch_buffer_settings (role, shift_key)
  WHERE scope = 'role_shift' AND role IS NOT NULL AND shift_key IS NOT NULL;

-- 6) Validation trigger keeps scope/role/shift_key combinations coherent
CREATE OR REPLACE FUNCTION public.trg_validate_punch_buffer_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scope = 'global' THEN
    NEW.role := NULL; NEW.shift_key := NULL;
  ELSIF NEW.scope = 'role' THEN
    IF NEW.role IS NULL THEN RAISE EXCEPTION 'role required for scope=role'; END IF;
    NEW.shift_key := NULL;
  ELSIF NEW.scope = 'shift' THEN
    IF NEW.shift_key IS NULL THEN RAISE EXCEPTION 'shift_key required for scope=shift'; END IF;
    NEW.role := NULL;
  ELSIF NEW.scope = 'role_shift' THEN
    IF NEW.role IS NULL OR NEW.shift_key IS NULL THEN
      RAISE EXCEPTION 'role and shift_key required for scope=role_shift';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid scope: %', NEW.scope;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_punch_buffer_scope ON public.punch_buffer_settings;
CREATE TRIGGER validate_punch_buffer_scope
  BEFORE INSERT OR UPDATE ON public.punch_buffer_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_punch_buffer_scope();

-- 7) Seed PM shift defaults
INSERT INTO public.punch_buffer_settings (scope, shift_key, clock_in_early_min, clock_in_late_min, clock_out_early_min, clock_out_late_min)
VALUES ('shift', 'S2', 30, 60, 30, 180)
ON CONFLICT DO NOTHING;