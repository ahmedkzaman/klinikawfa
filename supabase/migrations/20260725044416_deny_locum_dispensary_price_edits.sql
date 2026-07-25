-- Dispensary price edits are allowed for every authenticated clinic role
-- except locum. Keep this permission separate from the broader clinical
-- helper, because locums need clinical access elsewhere.
CREATE OR REPLACE FUNCTION public.can_edit_dispensary_prices(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin', 'special_admin', 'doctor_admin', 'resident_doctor',
        'ops_staff', 'operations', 'staff', 'purchaser', 'staff_nurse'
      )
  )
$function$;

ALTER FUNCTION public.can_edit_dispensary_prices(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_edit_dispensary_prices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_dispensary_prices(uuid) TO authenticated;

DROP POLICY IF EXISTS "consultation_items_staff_update_active" ON public.consultation_items;
CREATE POLICY "consultation_items_staff_update_active"
  ON public.consultation_items FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.can_edit_dispensary_prices(auth.uid()))
  WITH CHECK (public.can_edit_dispensary_prices(auth.uid()));
