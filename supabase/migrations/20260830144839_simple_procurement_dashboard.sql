-- =============================================================
-- Simple Procurement Dashboard — database foundation (Task 1)
-- Four-stage workflow: Draft -> Awaiting approval -> Ordered -> Received
-- (Cancelled retained for history only)
-- =============================================================

-- -------------------------------------------------------------
-- 1. Column extensions
-- -------------------------------------------------------------

alter table public.suppliers
  add column if not exists lead_time_days integer not null default 7
  check (lead_time_days between 0 and 365);

alter table public.clinic_settings
  add column if not exists procurement_routine_order_limit numeric(12,2)
  not null default 500 check (procurement_routine_order_limit >= 0);

alter table public.purchase_orders
  add column if not exists order_channel text not null default 'internal',
  add column if not exists supplier_reference text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists ordered_at timestamptz,
  add column if not exists ordered_by uuid;

alter table public.purchase_orders
  add constraint purchase_orders_order_channel_check
  check (order_channel in ('internal','whatsapp','supplier_website','phone','email','other'));

-- Migrate the legacy 'Sent' stage into the new 'Ordered' stage
update public.purchase_orders set status = 'Ordered' where status = 'Sent';

-- -------------------------------------------------------------
-- 2. Budget + attachment tables
-- -------------------------------------------------------------

create table public.procurement_monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  budget_month date not null check (budget_month = date_trunc('month', budget_month)::date),
  category text not null check (category in ('medicines','consumables','vaccines','other')),
  amount numeric(12,2) not null check (amount >= 0),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_month, category)
);

create index idx_procurement_monthly_budgets_month_category
  on public.procurement_monthly_budgets (budget_month, category);

create table public.procurement_attachments (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index idx_procurement_attachments_po
  on public.procurement_attachments (po_id, created_at);

create index idx_purchase_orders_status_expected_date
  on public.purchase_orders (status, expected_date);

-- -------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------

alter table public.procurement_monthly_budgets enable row level security;
alter table public.procurement_attachments enable row level security;

grant select, insert, update, delete on public.procurement_monthly_budgets to authenticated;
grant select, insert, delete on public.procurement_attachments to authenticated;

create policy "procurement staff read budgets"
  on public.procurement_monthly_budgets for select to authenticated
  using (public.can_manage_inventory((select auth.uid())));

create policy "procurement approvers write budgets"
  on public.procurement_monthly_budgets for all to authenticated
  using (public.has_clinic_permission('procurement.approve', (select auth.uid())))
  with check (
    public.has_clinic_permission('procurement.approve', (select auth.uid()))
    and updated_by = (select auth.uid())
  );

create policy "procurement staff read attachments"
  on public.procurement_attachments for select to authenticated
  using (public.can_manage_inventory((select auth.uid())));

create policy "procurement staff add attachments"
  on public.procurement_attachments for insert to authenticated
  with check (
    public.can_manage_inventory((select auth.uid()))
    and uploaded_by = (select auth.uid())
  );

create policy "procurement staff delete attachments"
  on public.procurement_attachments for delete to authenticated
  using (public.can_manage_inventory((select auth.uid())));

-- -------------------------------------------------------------
-- 4. Private storage bucket + object policies
-- -------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'procurement-documents', 'procurement-documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "procurement staff read documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'procurement-documents'
    and public.can_manage_inventory((select auth.uid()))
  );

create policy "procurement staff upload documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'procurement-documents'
    and public.can_manage_inventory((select auth.uid()))
  );

create policy "procurement staff delete documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'procurement-documents'
    and public.can_manage_inventory((select auth.uid()))
  );

-- -------------------------------------------------------------
-- 5. procurement.approve permission defaults
-- -------------------------------------------------------------

insert into public.clinic_role_permissions (role, permission_key, allowed)
values
  ('admin', 'procurement.approve', true),
  ('special_admin', 'procurement.approve', true),
  ('doctor_admin', 'procurement.approve', true),
  ('doctor', 'procurement.approve', false),
  ('nurse', 'procurement.approve', false),
  ('staff', 'procurement.approve', false)
on conflict (role, permission_key) do nothing;

-- -------------------------------------------------------------
-- 6. Make the permission manageable in Clinic Permissions UI
-- -------------------------------------------------------------

create or replace function public.get_clinic_user_permission_details(_target_user_id uuid)
returns table (
  permission_key text,
  role_allowed boolean,
  override_allowed boolean,
  effective_allowed boolean,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permission_keys(permission_key) AS (
    VALUES
      ('access.manage_permissions'),
      ('patients.view'),
      ('patients.edit'),
      ('queue.manage'),
      ('consultation.write'),
      ('billing.manage'),
      ('reports.view'),
      ('settings.manage'),
      ('procurement.approve')
  ),
  target_role AS (
    SELECT ur.role
    FROM public.user_roles ur
    WHERE ur.user_id = _target_user_id
    LIMIT 1
  )
  SELECT
    k.permission_key,
    COALESCE(rp.allowed, false) AS role_allowed,
    uo.allowed AS override_allowed,
    public.has_clinic_permission(k.permission_key, _target_user_id) AS effective_allowed,
    uo.updated_at,
    uo.updated_by
  FROM permission_keys k
  LEFT JOIN target_role tr ON true
  LEFT JOIN public.clinic_role_permissions rp
    ON rp.role = tr.role AND rp.permission_key = k.permission_key
  LEFT JOIN public.clinic_user_permission_overrides uo
    ON uo.user_id = _target_user_id AND uo.permission_key = k.permission_key
  WHERE public.can_manage_clinic_permissions(auth.uid())
  ORDER BY k.permission_key
$$;

REVOKE ALL ON FUNCTION public.get_clinic_user_permission_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_user_permission_details(uuid) TO authenticated;

-- -------------------------------------------------------------
-- 7. Four-stage workflow: validator + transition guard
-- -------------------------------------------------------------

create or replace function public.trg_validate_po_status()
returns trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('Draft','Awaiting approval','Ordered','Received','Cancelled') THEN
    RAISE EXCEPTION 'INVALID_PO_STATUS: %', NEW.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Block direct client updates of status / approval / ordering metadata.
-- Only guarded RPCs (Task 2) may set app.procurement_transition = 'allowed'.
create or replace function public.guard_purchase_order_status()
returns trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
    OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
    OR OLD.ordered_at IS DISTINCT FROM NEW.ordered_at
    OR OLD.ordered_by IS DISTINCT FROM NEW.ordered_by
  ) THEN
    IF current_setting('app.procurement_transition', true) <> 'allowed' THEN
      RAISE EXCEPTION 'USE_PROCUREMENT_TRANSITION_RPC'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

revoke all on function public.guard_purchase_order_status() from public;

drop trigger if exists trg_purchase_orders_guard_status on public.purchase_orders;
create trigger trg_purchase_orders_guard_status
before update of status, approved_at, approved_by, ordered_at, ordered_by
on public.purchase_orders
for each row execute function public.guard_purchase_order_status();
