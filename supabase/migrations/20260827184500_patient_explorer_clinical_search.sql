-- Patient Explorer: search demographics, diagnoses, and medication names.
--
-- SECURITY INVOKER is intentional: callers retain the same RLS restrictions
-- that apply when selecting these tables directly. The function does not grant
-- broader access to patient or clinical data.
CREATE OR REPLACE FUNCTION public.search_patients(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.patients
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH search_input AS (
    SELECT NULLIF(lower(btrim(p_search)), '') AS term
  )
  SELECT p.*
  FROM public.patients AS p
  CROSS JOIN search_input AS input
  WHERE
    input.term IS NULL
    OR strpos(lower(COALESCE(p.name, '')), input.term) > 0
    OR strpos(lower(COALESCE(p.phone, '')), input.term) > 0
    OR strpos(lower(COALESCE(p.national_id, '')), input.term) > 0
    OR strpos(lower(COALESCE(p.passport_no, '')), input.term) > 0
    OR strpos(lower(COALESCE(p.reg_no, '')), input.term) > 0
    OR EXISTS (
      SELECT 1
      FROM public.consultations AS c
      LEFT JOIN public.diagnoses AS d ON d.id = c.diagnosis_id
      WHERE c.patient_id = p.id
        AND c.deleted_at IS NULL
        AND (
          strpos(lower(COALESCE(c.diagnosis_text, '')), input.term) > 0
          OR strpos(lower(COALESCE(d.name, '')), input.term) > 0
          OR strpos(lower(COALESCE(d.search_aliases, '')), input.term) > 0
          OR EXISTS (
            SELECT 1
            FROM public.consultation_items AS ci
            LEFT JOIN public.inventory_items AS medicine ON medicine.id = ci.item_id
            WHERE ci.consultation_id = c.id
              AND ci.deleted_at IS NULL
              AND ci.item_id IS NOT NULL
              AND (
                strpos(lower(COALESCE(ci.item_name, '')), input.term) > 0
                OR strpos(lower(COALESCE(medicine.name, '')), input.term) > 0
                OR strpos(lower(COALESCE(medicine.generic_name, '')), input.term) > 0
                OR strpos(lower(COALESCE(medicine.brand, '')), input.term) > 0
              )
          )
        )
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.search_patients(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_patients(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_patients(text, integer) TO authenticated;

COMMENT ON FUNCTION public.search_patients(text, integer) IS
  'RLS-preserving Patient Explorer search across demographics, diagnosis names/text/aliases, and medication snapshot/catalog/generic/brand names. Dose, strength, frequency, formulation, and route are not required.';
