-- inventory.manage: bring inventory editing under the Clinic Permissions
-- matrix. Seeds role defaults for every app role and redefines
-- can_manage_inventory() to honor them (role default + personal override via
-- has_clinic_permission), with a hard floor for clinical-excluded roles and a
-- legacy-rule fallback for roles that somehow have no seeded row.

-- 1) Role defaults. True: admins, ops tier, purchaser, staff_nurse.
--    False (tightened): staff, resident_doctor, locum, guest, website_editor.
insert into public.clinic_role_permissions (role, permission_key, allowed)
values
  ('admin',           'inventory.manage', true),
  ('special_admin',   'inventory.manage', true),
  ('doctor_admin',    'inventory.manage', true),
  ('operations',      'inventory.manage', true),
  ('ops_staff',       'inventory.manage', true),
  ('purchaser',       'inventory.manage', true),
  ('staff_nurse',     'inventory.manage', true),
  ('staff',           'inventory.manage', false),
  ('resident_doctor', 'inventory.manage', false),
  ('locum',           'inventory.manage', false),
  ('guest',           'inventory.manage', false),
  ('website_editor',  'inventory.manage', false)
on conflict (role, permission_key) do nothing;

-- 2) Matrix-driven can_manage_inventory. Hard floor first (resident_doctor,
--    locum, guest never manage inventory), then the matrix decision for the
--    user's role; roles without a seeded row fall back to the legacy rule so
--    this never widens access by accident.
create or replace function public.can_manage_inventory(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    not exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role::text in ('resident_doctor','locum','guest')
    )
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = _user_id
        and (
          public.has_clinic_permission('inventory.manage', _user_id)
          or (
            not exists (
              select 1 from public.clinic_role_permissions crp
              where crp.permission_key = 'inventory.manage'
                and crp.role = ur.role
            )
            and ur.role::text not in ('resident_doctor','locum','guest')
          )
        )
      limit 1
    )
$function$;

revoke all on function public.can_manage_inventory(uuid) from public;
grant execute on function public.can_manage_inventory(uuid) to authenticated;
