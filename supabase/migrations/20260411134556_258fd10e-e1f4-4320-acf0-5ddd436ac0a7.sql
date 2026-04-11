
-- Create daily_reports table
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  briefing_selfie_url text,
  stock_photo_1_url text,
  stock_photo_2_url text,
  whatsapp_blast_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access daily reports"
  ON public.daily_reports FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Staff can view own
CREATE POLICY "Staff can view own daily reports"
  ON public.daily_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Staff can insert own
CREATE POLICY "Staff can insert own daily reports"
  ON public.daily_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Staff can update own
CREATE POLICY "Staff can update own daily reports"
  ON public.daily_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-reports', 'daily-reports', true);

-- Storage policies
CREATE POLICY "Anyone can view daily report files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'daily-reports');

CREATE POLICY "Staff can upload own daily report files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'daily-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Staff can update own daily report files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'daily-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Staff can delete own daily report files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'daily-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Insert default WhatsApp blast target setting
INSERT INTO public.app_settings (key, value, description)
VALUES ('daily_whatsapp_blast_target', '5', 'Number of WhatsApp blasts each staff must complete daily')
ON CONFLICT (key) DO NOTHING;
