CREATE TABLE public.punch_buffer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  role app_role,
  clock_in_early_min integer NOT NULL DEFAULT 60,
  clock_in_late_min integer NOT NULL DEFAULT 60,
  clock_out_early_min integer NOT NULL DEFAULT 30,
  clock_out_late_min integer NOT NULL DEFAULT 120,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT punch_buffer_scope_chk CHECK (scope IN ('global','role')),
  CONSTRAINT punch_buffer_role_chk CHECK (
    (scope = 'global' AND role IS NULL) OR (scope = 'role' AND role IS NOT NULL)
  ),
  CONSTRAINT punch_buffer_in_early_chk CHECK (clock_in_early_min BETWEEN 0 AND 480),
  CONSTRAINT punch_buffer_in_late_chk CHECK (clock_in_late_min BETWEEN 0 AND 480),
  CONSTRAINT punch_buffer_out_early_chk CHECK (clock_out_early_min BETWEEN 0 AND 480),
  CONSTRAINT punch_buffer_out_late_chk CHECK (clock_out_late_min BETWEEN 0 AND 480)
);

CREATE UNIQUE INDEX punch_buffer_global_uniq
  ON public.punch_buffer_settings ((1)) WHERE scope = 'global';

CREATE UNIQUE INDEX punch_buffer_role_uniq
  ON public.punch_buffer_settings (role) WHERE scope = 'role';

ALTER TABLE public.punch_buffer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view punch buffer settings"
ON public.punch_buffer_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert punch buffer settings"
ON public.punch_buffer_settings FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update punch buffer settings"
ON public.punch_buffer_settings FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete punch buffer settings"
ON public.punch_buffer_settings FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

CREATE TRIGGER trg_punch_buffer_settings_updated_at
BEFORE UPDATE ON public.punch_buffer_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.punch_buffer_settings (scope, clock_in_early_min, clock_in_late_min, clock_out_early_min, clock_out_late_min)
VALUES ('global', 60, 60, 30, 120);