
CREATE TABLE public.staff_roster_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  hybrid_type text,
  permanent_off_days integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_roster_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access roster settings"
  ON public.staff_roster_settings FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Staff can view own roster settings"
  ON public.staff_roster_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_staff_roster_settings_updated_at
  BEFORE UPDATE ON public.staff_roster_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
