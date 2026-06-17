
CREATE OR REPLACE FUNCTION public.get_doctors_on_duty(_date date DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
RETURNS TABLE(shift text, label text, start_time text, end_time text, doctor_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  day jsonb;
  dk text;
BEGIN
  dk := to_char(_date, 'YYYY-MM-DD');
  SELECT roster_data INTO r
  FROM public.saved_rosters
  WHERE roster_type = 'doctor'
    AND month = EXTRACT(MONTH FROM _date)::int
    AND year = EXTRACT(YEAR FROM _date)::int
  ORDER BY updated_at DESC
  LIMIT 1;

  IF r IS NULL THEN RETURN; END IF;
  day := r -> dk;
  IF day IS NULL THEN RETURN; END IF;

  shift := 'S1'; label := 'Morning';   start_time := '08:00'; end_time := '14:00';
  doctor_name := COALESCE(day#>>'{DOC_S1,staffName}', day#>>'{shift1,staffName}');
  RETURN NEXT;

  shift := 'S2'; label := 'Afternoon'; start_time := '14:00'; end_time := '20:00';
  doctor_name := COALESCE(day#>>'{DOC_S2,staffName}', day#>>'{shift2,staffName}');
  RETURN NEXT;

  shift := 'S3'; label := 'Night';     start_time := '20:00'; end_time := '00:00';
  doctor_name := COALESCE(day#>>'{DOC_S3,staffName}', day#>>'{shift3,staffName}');
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctors_on_duty(date) TO anon, authenticated;
