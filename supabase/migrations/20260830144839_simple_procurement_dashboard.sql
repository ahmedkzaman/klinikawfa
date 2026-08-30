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
  ('operations', 'procurement.approve', false),
  ('ops_staff', 'procurement.approve', false),
  ('staff', 'procurement.approve', false),
  ('purchaser', 'procurement.approve', false),
  ('staff_nurse', 'procurement.approve', false)
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
    IF coalesce(current_setting('app.procurement_transition', true), '') <> 'allowed' THEN
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

-- =============================================================
-- Task 2: authoritative budgets, guarded transitions, summaries,
-- stock planning view, and atomic receiving
-- =============================================================

-- -------------------------------------------------------------
-- Guarded transition entry point (SECURITY INVOKER)
-- -------------------------------------------------------------

create or replace function public.transition_purchase_order(
  _po_id uuid,
  _requested_status text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_total numeric(14,2);
  v_limit numeric(12,2);
  v_month date;
  v_over_budget boolean;
begin
  if not public.can_manage_inventory(auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if _requested_status not in ('Ordered','Cancelled') then
    raise exception 'INVALID_TRANSITION: %', _requested_status using errcode = 'P0001';
  end if;

  select status into v_status
  from public.purchase_orders
  where id = _po_id
  for update;

  if not found then
    raise exception 'PO_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Cancellation: allowed from Draft, Awaiting approval, or Ordered
  if _requested_status = 'Cancelled' then
    if v_status not in ('Draft','Awaiting approval','Ordered') then
      raise exception 'INVALID_TRANSITION: cannot cancel from %', v_status using errcode = 'P0001';
    end if;
    perform set_config('app.procurement_transition', 'allowed', true);
    update public.purchase_orders
      set status = 'Cancelled', updated_at = now()
    where id = _po_id;
    return 'Cancelled';
  end if;

  if v_status = 'Draft' then
    -- Candidate total and per-category comparison against budgets
    select coalesce(sum(it.total_price), 0) into v_total
    from public.purchase_order_items it
    where it.po_id = _po_id;

    select coalesce(cs.procurement_routine_order_limit, 500) into v_limit
    from public.clinic_settings cs
    limit 1;

    v_month := date_trunc('month', coalesce(
      (select order_date from public.purchase_orders where id = _po_id),
      current_date))::date;

    select coalesce(bool_or(candidate > budget), false)
    into v_over_budget
    from (
      select
        candidate.category,
        candidate.candidate_total + existing.committed + existing.received as candidate,
        b.amount as budget
      from (
        select
          case inv.category
            when 'Medication' then 'medicines'
            when 'Disposable Item' then 'consumables'
            when 'Vaccine' then 'vaccines'
            else 'other'
          end as category,
          sum(it.total_price) as candidate_total
        from public.purchase_order_items it
        join public.inventory_items inv on inv.id = it.inventory_item_id
        where it.po_id = _po_id
        group by 1
      ) candidate
      join public.procurement_monthly_budgets b
        on b.budget_month = v_month and b.category = candidate.category
      left join (
        select
          case inv.category
            when 'Medication' then 'medicines'
            when 'Disposable Item' then 'consumables'
            when 'Vaccine' then 'vaccines'
            else 'other'
          end as category,
          sum(case when po.status = 'Ordered' then it.total_price else 0 end) as committed,
          sum(case when po.status = 'Received' then it.total_price else 0 end) as received
        from public.purchase_orders po
        join public.purchase_order_items it on it.po_id = po.id
        join public.inventory_items inv on inv.id = it.inventory_item_id
        where po.status in ('Ordered','Received')
          and po.order_date >= v_month
          and po.order_date < v_month + interval '1 month'
        group by 1
      ) existing on existing.category = candidate.category
    ) compare;

    if v_total > v_limit or v_over_budget then
      perform set_config('app.procurement_transition', 'allowed', true);
      update public.purchase_orders
        set status = 'Awaiting approval', updated_at = now()
      where id = _po_id;
      return 'Awaiting approval';
    end if;

    perform set_config('app.procurement_transition', 'allowed', true);
    update public.purchase_orders
      set status = 'Ordered',
          ordered_at = now(),
          ordered_by = auth.uid(),
          updated_at = now()
    where id = _po_id;
    return 'Ordered';

  elsif v_status = 'Awaiting approval' then
    if not public.has_clinic_permission('procurement.approve', auth.uid()) then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
    perform set_config('app.procurement_transition', 'allowed', true);
    update public.purchase_orders
      set status = 'Ordered',
          approved_at = now(),
          approved_by = auth.uid(),
          ordered_at = now(),
          ordered_by = auth.uid(),
          updated_at = now()
    where id = _po_id;
    return 'Ordered';

  else
    raise exception 'INVALID_TRANSITION: cannot order from %', v_status using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.transition_purchase_order(uuid, text) from public;
grant execute on function public.transition_purchase_order(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- Dashboard summary (STABLE SECURITY INVOKER)
-- -------------------------------------------------------------

create or replace function public.get_procurement_dashboard(_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', _month)::date;
  v_month_end date := (v_month_start + interval '1 month')::date;
  v_result jsonb;
begin
  select jsonb_build_object(
    'month', to_char(v_month_start, 'YYYY-MM-DD'),
    'budgetRows', (
      select jsonb_agg(jsonb_build_object(
        'category', c.category,
        'budget', coalesce(b.amount, 0),
        'committed', coalesce(t.committed, 0),
        'received', coalesce(t.received, 0),
        'remaining', coalesce(b.amount, 0) - coalesce(t.committed, 0) - coalesce(t.received, 0)
      ) order by c.ord)
      from (values (0,'medicines'),(1,'consumables'),(2,'vaccines'),(3,'other')) as c(ord, category)
      left join public.procurement_monthly_budgets b
        on b.budget_month = v_month_start and b.category = c.category
      left join (
        select
          case inv.category
            when 'Medication' then 'medicines'
            when 'Disposable Item' then 'consumables'
            when 'Vaccine' then 'vaccines'
            else 'other'
          end as category,
          sum(case when po.status = 'Ordered' then it.total_price else 0 end) as committed,
          sum(case when po.status = 'Received' then it.total_price else 0 end) as received
        from public.purchase_orders po
        join public.purchase_order_items it on it.po_id = po.id
        join public.inventory_items inv on inv.id = it.inventory_item_id
        where po.status in ('Ordered','Received')
          and (
            (po.status = 'Ordered' and po.order_date >= v_month_start and po.order_date < v_month_end)
            or (po.status = 'Received' and
                (po.received_at at time zone 'Asia/Kuala_Lumpur')::date >= v_month_start
            and (po.received_at at time zone 'Asia/Kuala_Lumpur')::date < v_month_end)
          )
        group by 1
      ) t on t.category = c.category
    ),
    'totals', (
      select jsonb_build_object(
        'budget', sum(coalesce(x.budget,0)),
        'committed', sum(coalesce(x.committed,0)),
        'received', sum(coalesce(x.received,0)),
        'remaining', sum(coalesce(x.budget,0) - coalesce(x.committed,0) - coalesce(x.received,0)))
      from (
        select
          coalesce(b.amount, 0) as budget,
          coalesce(t.committed, 0) as committed,
          coalesce(t.received, 0) as received
        from (values ('medicines'),('consumables'),('vaccines'),('other')) as c(category)
        left join public.procurement_monthly_budgets b
          on b.budget_month = v_month_start and b.category = c.category
        left join (
          select
            case inv.category
              when 'Medication' then 'medicines'
              when 'Disposable Item' then 'consumables'
              when 'Vaccine' then 'vaccines'
              else 'other'
            end as category,
            sum(case when po.status = 'Ordered' then it.total_price else 0 end) as committed,
            sum(case when po.status = 'Received' then it.total_price else 0 end) as received
          from public.purchase_orders po
          join public.purchase_order_items it on it.po_id = po.id
          join public.inventory_items inv on inv.id = it.inventory_item_id
          where po.status in ('Ordered','Received')
            and (
              (po.status = 'Ordered' and po.order_date >= v_month_start and po.order_date < v_month_end)
              or (po.status = 'Received' and
                  (po.received_at at time zone 'Asia/Kuala_Lumpur')::date >= v_month_start
              and (po.received_at at time zone 'Asia/Kuala_Lumpur')::date < v_month_end)
            )
          group by 1
        ) t on t.category = c.category
      ) x
    ),
    'counts', jsonb_build_object(
      'stockoutRisk', (
        select count(*) from public.v_procurement_stock_planning
        where current_stock <= reorder_level
      ),
      'awaitingApproval', (
        select count(*) from public.purchase_orders where status = 'Awaiting approval'
      ),
      'awaitingDelivery', (
        select count(*) from public.purchase_orders where status = 'Ordered'
      ),
      'overdue', (
        select count(*) from public.purchase_orders
        where status = 'Ordered' and expected_date < current_date
      ),
      'expiringSoon', (
        select count(*) from public.inventory_items
        where status = 'active'
          and coalesce(stock, 0) > 0
          and nearest_expiry_date is not null
          and nearest_expiry_date between current_date and current_date + 90
      )
    ),
    'actions', (
      select coalesce(jsonb_agg(a.action order by a.ord), '[]'::jsonb)
      from (
        -- stockout actions
        select 0 as ord, jsonb_build_object(
          'id', 'stockout:' || p.item_id::text,
          'kind', 'stockout',
          'title', p.name || ' may run out in ' || coalesce(ceil(p.days_cover), 0)::text || ' days',
          'dueDate', null,
          'poId', null,
          'itemId', p.item_id::text
        ) as action
        from public.v_procurement_stock_planning p
        where p.current_stock <= p.reorder_level
        union all
        -- approval actions
        select 1, jsonb_build_object(
          'id', 'approval:' || po.id::text,
          'kind', 'approval',
          'title', po.po_number || ' awaiting management approval',
          'dueDate', null,
          'poId', po.id::text,
          'itemId', null
        )
        from public.purchase_orders po
        where po.status = 'Awaiting approval'
        union all
        -- overdue actions
        select 2, jsonb_build_object(
          'id', 'overdue:' || po.id::text,
          'kind', 'overdue',
          'title', po.po_number || ' overdue since ' || to_char(po.expected_date, 'YYYY-MM-DD'),
          'dueDate', to_char(po.expected_date, 'YYYY-MM-DD'),
          'poId', po.id::text,
          'itemId', null
        )
        from public.purchase_orders po
        where po.status = 'Ordered' and po.expected_date < current_date
        union all
        -- follow-up actions
        select 3, jsonb_build_object(
          'id', 'follow_up:' || po.id::text,
          'kind', 'follow_up',
          'title', po.po_number || ' not received after supplier lead time',
          'dueDate', to_char(po.expected_date, 'YYYY-MM-DD'),
          'poId', po.id::text,
          'itemId', null
        )
        from public.purchase_orders po
        join public.suppliers s on s.id = po.supplier_id
        where po.status = 'Ordered'
          and po.ordered_at < now() - make_interval(days => coalesce(s.lead_time_days, 7))
          and po.expected_date >= current_date
        union all
        -- expiry actions
        select 4, jsonb_build_object(
          'id', 'expiry:' || i.id::text,
          'kind', 'expiry',
          'title', i.name || ' expires ' || to_char(i.nearest_expiry_date, 'YYYY-MM-DD'),
          'dueDate', to_char(i.nearest_expiry_date, 'YYYY-MM-DD'),
          'poId', null,
          'itemId', i.id::text
        )
        from public.inventory_items i
        where i.status = 'active'
          and coalesce(i.stock, 0) > 0
          and i.nearest_expiry_date between current_date and current_date + 90
      ) a
    )
  )
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_procurement_dashboard(date) from public;
grant execute on function public.get_procurement_dashboard(date) to authenticated;

-- -------------------------------------------------------------
-- Stock planning view (single source for the planning table)
-- -------------------------------------------------------------

create or replace view public.v_procurement_stock_planning
with (security_invoker = true) as
select
  m.item_id,
  m.name,
  i.category,
  m.current_stock,
  m.reorder_level,
  m.used_30d,
  m.avg_daily_usage,
  m.days_cover,
  m.movement_status,
  coalesce(o.open_order_qty, 0) as open_order_qty,
  coalesce(ls.lead_time_days, 7) as supplier_lead_time_days,
  coalesce(b.nearest_expiry_date, i.nearest_expiry_date) as nearest_expiry_date,
  case
    when m.avg_daily_usage > 0 then
      greatest(
        ceil(m.avg_daily_usage * (coalesce(ls.lead_time_days, 7) + 7))  -- 7 = urgent days buffer
        - m.current_stock
        - coalesce(o.open_order_qty, 0),
        0
      )::integer
    else null
  end as suggested_qty,
  case
    when m.avg_daily_usage > 0 then 'Based on 90-day usage, lead time, and open orders'
    when m.current_stock <= m.reorder_level then 'Low stock'
    else 'Insufficient usage data'
  end as recommendation_reason
from public.v_inventory_movement_stats m
join public.inventory_items i on i.id = m.item_id
left join lateral (
  select s2.lead_time_days
  from public.purchase_order_items it2
  join public.purchase_orders po2 on po2.id = it2.po_id
  join public.suppliers s2 on s2.id = po2.supplier_id
  where it2.inventory_item_id = m.item_id
  order by po2.created_at desc
  limit 1
) ls on true
left join (
  select it.inventory_item_id, sum(it.order_qty - it.received_qty) as open_order_qty
  from public.purchase_order_items it
  join public.purchase_orders po on po.id = it.po_id
  where po.status in ('Awaiting approval','Ordered')
  group by it.inventory_item_id
) o on o.inventory_item_id = m.item_id
left join (
  select inventory_item_id, min(expiry_date) as nearest_expiry_date
  from public.inventory_item_batches
  where quantity_remaining > 0
  group by inventory_item_id
) b on b.inventory_item_id = m.item_id;

grant select on public.v_procurement_stock_planning to authenticated;

-- -------------------------------------------------------------
-- Atomic receiving (Ordered -> Received, guarded)
-- -------------------------------------------------------------

create or replace function public.receive_purchase_order(_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  r record;
begin
  if not public.can_manage_inventory(auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select status into v_status
  from public.purchase_orders
  where id = _po_id
  for update;

  if not found then
    raise exception 'PO_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status <> 'Ordered' then
    raise exception 'PO_NOT_ORDERED' using errcode = 'P0001';
  end if;

  for r in
    select id, inventory_item_id, order_qty
    from public.purchase_order_items
    where po_id = _po_id
  loop
    update public.inventory_items
      set stock = coalesce(stock, 0) + r.order_qty,
          updated_at = now()
    where id = r.inventory_item_id;

    update public.purchase_order_items
      set received_qty = r.order_qty,
          updated_at = now()
    where id = r.id;
  end loop;

  perform set_config('app.procurement_transition', 'allowed', true);

  update public.purchase_orders
    set status = 'Received',
        received_at = now(),
        received_by = auth.uid(),
        updated_at = now()
  where id = _po_id;
end;
$$;

revoke all on function public.receive_purchase_order(uuid) from public;
grant execute on function public.receive_purchase_order(uuid) to authenticated;
