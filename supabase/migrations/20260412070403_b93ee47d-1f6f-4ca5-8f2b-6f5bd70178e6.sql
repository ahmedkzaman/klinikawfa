
-- Create circular_notices table
CREATE TABLE public.circular_notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create circular_notice_acknowledgements table
CREATE TABLE public.circular_notice_acknowledgements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notice_id UUID NOT NULL REFERENCES public.circular_notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notice_id, user_id)
);

-- Enable RLS
ALTER TABLE public.circular_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circular_notice_acknowledgements ENABLE ROW LEVEL SECURITY;

-- RLS for circular_notices
CREATE POLICY "Admin can manage notices" ON public.circular_notices
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff can view active notices" ON public.circular_notices
  FOR SELECT TO authenticated
  USING (is_active = true AND public.is_staff_or_admin(auth.uid()));

-- RLS for circular_notice_acknowledgements
CREATE POLICY "Staff can insert own acknowledgements" ON public.circular_notice_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view own acknowledgements" ON public.circular_notice_acknowledgements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all acknowledgements" ON public.circular_notice_acknowledgements
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_circular_notices_updated_at
  BEFORE UPDATE ON public.circular_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.circular_notices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.circular_notice_acknowledgements;
