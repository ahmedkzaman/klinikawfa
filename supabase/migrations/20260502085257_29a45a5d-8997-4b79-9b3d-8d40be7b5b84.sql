CREATE TABLE public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view holidays"
ON public.public_holidays
FOR SELECT
TO authenticated
USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Admin can insert holidays"
ON public.public_holidays
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin can update holidays"
ON public.public_holidays
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin can delete holidays"
ON public.public_holidays
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_public_holidays_date ON public.public_holidays (holiday_date);