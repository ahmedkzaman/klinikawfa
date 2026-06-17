
CREATE TABLE public.saved_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_type text NOT NULL, -- 'doctor' or 'support'
  month integer NOT NULL, -- 0-11
  year integer NOT NULL,
  roster_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(roster_type, month, year)
);

ALTER TABLE public.saved_rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/Admin can view saved rosters"
  ON public.saved_rosters FOR SELECT
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can insert saved rosters"
  ON public.saved_rosters FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update saved rosters"
  ON public.saved_rosters FOR UPDATE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete saved rosters"
  ON public.saved_rosters FOR DELETE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));
