-- ============================================================================
-- A2. Update role helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('operations','admin','special_admin','doctor_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_insights(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin')
  )
$$;

-- ============================================================================
-- A3. patients.reg_no — column, backfill, sequence, trigger
-- ============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS reg_no TEXT;

CREATE SEQUENCE IF NOT EXISTS public.patient_reg_no_seq START 1;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY registration_date NULLS LAST, created_at) AS rn
  FROM public.patients
  WHERE reg_no IS NULL
)
UPDATE public.patients p
   SET reg_no = 'KA-' || lpad(o.rn::text, 5, '0')
  FROM ordered o
 WHERE p.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS patients_reg_no_unique ON public.patients(reg_no);

CREATE OR REPLACE FUNCTION public.trg_assign_reg_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reg_no IS NULL THEN
    NEW.reg_no := 'KA-' || lpad(nextval('public.patient_reg_no_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS patients_assign_reg_no ON public.patients;
CREATE TRIGGER patients_assign_reg_no
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_reg_no();

SELECT setval(
  'public.patient_reg_no_seq',
  GREATEST((SELECT COUNT(*) FROM public.patients), 1),
  true
);

-- ============================================================================
-- A4. Recreate insight_financials_view to include reg_no
-- ============================================================================

DROP VIEW IF EXISTS public.insight_financials_view;

CREATE VIEW public.insight_financials_view
WITH (security_invoker = true)
AS
SELECT
  ci.id,
  ci.item_name,
  date(qe.created_at)                                AS visit_date,
  qe.payment_method,
  (ci.price * ci.quantity)::numeric                  AS revenue,
  ((ci.price - ci.unit_cost) * ci.quantity)::numeric AS profit,
  qe.id                                              AS queue_entry_id,
  c.doctor_id,
  COALESCE(d.name, 'Unassigned')                     AS doctor_name,
  c.diagnosis_id,
  COALESCE(dx.name, NULLIF(c.diagnosis_text, ''), 'Undiagnosed') AS diagnosis_name,
  qe.patient_id,
  p.reg_no                                           AS patient_reg_no,
  CASE
    WHEN ci.service_id IS NOT NULL THEN 'service'
    WHEN ci.item_id    IS NOT NULL THEN 'medication'
    WHEN ci.package_id IS NOT NULL THEN 'package'
    ELSE 'other'
  END                                                AS kind
FROM public.consultation_items ci
JOIN public.consultations  c  ON ci.consultation_id = c.id
JOIN public.queue_entries  qe ON c.queue_entry_id   = qe.id
LEFT JOIN public.doctors    d  ON c.doctor_id       = d.id
LEFT JOIN public.diagnoses  dx ON c.diagnosis_id    = dx.id
LEFT JOIN public.patients   p  ON qe.patient_id     = p.id
WHERE c.status = 'completed'
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;