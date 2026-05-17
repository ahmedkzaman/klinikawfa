CREATE OR REPLACE VIEW public.v_seasonal_diagnosis_trends AS
WITH months AS (
  SELECT generate_series(1, 12) AS calendar_month
),
diagnosis_groups AS (
  SELECT DISTINCT COALESCE(group_category, 'Uncategorized') AS diagnosis_group
  FROM public.diagnoses
),
skeleton AS (
  SELECT m.calendar_month, d.diagnosis_group
  FROM months m CROSS JOIN diagnosis_groups d
),
actuals AS (
  SELECT
    COALESCE(d.group_category, 'Uncategorized') AS diagnosis_group,
    EXTRACT(MONTH FROM c.created_at)::int       AS calendar_month,
    COUNT(c.id)                                  AS total_cases,
    COUNT(DISTINCT EXTRACT(YEAR FROM c.created_at)) AS years_active
  FROM public.consultations c
  LEFT JOIN public.diagnoses d ON c.diagnosis_id = d.id
  WHERE c.deleted_at IS NULL
  GROUP BY 1, 2
)
SELECT
  s.diagnosis_group,
  s.calendar_month,
  COALESCE(a.total_cases, 0)   AS total_cases,
  COALESCE(a.years_active, 0)  AS years_active,
  CASE
    WHEN COALESCE(a.years_active, 0) = 0 THEN 0
    ELSE ROUND(a.total_cases::numeric / a.years_active, 0)
  END AS avg_expected_cases
FROM skeleton s
LEFT JOIN actuals a
  ON s.diagnosis_group = a.diagnosis_group
 AND s.calendar_month  = a.calendar_month;

GRANT SELECT ON public.v_seasonal_diagnosis_trends TO authenticated;