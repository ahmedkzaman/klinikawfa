-- Drug Label Settings — singleton table that controls which fields render on printed labels
CREATE TABLE public.drug_label_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_address      boolean NOT NULL DEFAULT true,
  show_tel_number   boolean NOT NULL DEFAULT true,
  show_precaution   boolean NOT NULL DEFAULT true,
  show_quantity     boolean NOT NULL DEFAULT true,
  show_date         boolean NOT NULL DEFAULT true,
  show_expiry_date  boolean NOT NULL DEFAULT true,
  show_duration     boolean NOT NULL DEFAULT true,
  show_indication   boolean NOT NULL DEFAULT true,
  -- Singleton lock: this column is UNIQUE, so the table can only ever hold one row.
  singleton         boolean NOT NULL DEFAULT true UNIQUE,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drug_label_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_label_settings_select"
  ON public.drug_label_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "drug_label_settings_insert"
  ON public.drug_label_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "drug_label_settings_update"
  ON public.drug_label_settings FOR UPDATE
  TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- Keep updated_at fresh
CREATE TRIGGER set_drug_label_settings_updated_at
  BEFORE UPDATE ON public.drug_label_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the singleton row
INSERT INTO public.drug_label_settings (singleton) VALUES (true);