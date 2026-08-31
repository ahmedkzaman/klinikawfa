-- Make the special_admin role's permission-management power explicit and
-- visible in the Clinic Permissions matrix (it was previously implied only
-- inside the can_manage_clinic_permissions function).
insert into public.clinic_role_permissions (role, permission_key, allowed)
values ('special_admin', 'access.manage_permissions', true)
on conflict (role, permission_key) do nothing;
