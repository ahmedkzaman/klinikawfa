-- Create app_settings table for storing configuration like API keys
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view settings
CREATE POLICY "Admins can view all settings"
ON public.app_settings
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings"
ON public.app_settings
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
ON public.app_settings
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Only admins can delete settings
CREATE POLICY "Admins can delete settings"
ON public.app_settings
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial Stripe key placeholder (empty value)
INSERT INTO public.app_settings (key, value, description)
VALUES ('stripe_secret_key', '', 'Stripe Secret API Key for payment processing');