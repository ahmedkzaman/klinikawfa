create or replace function public.get_clinic_health_metrics(_start_date date, _end_date date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_staff_or_admin(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'financial', jsonb_build_object(
      'revenue', coalesce((select sum(ci.price * ci.quantity) from consultation_items ci join consultations c on c.id = ci.consultation_id join queue_entries q on q.id = c.queue_entry_id where q.created_at::date between _start_date and _end_date and c.status = 'completed' and ci.deleted_at is null), 0),
      'profit', coalesce((select sum((ci.price - ci.unit_cost) * ci.quantity) from consultation_items ci join consultations c on c.id = ci.consultation_id join queue_entries q on q.id = c.queue_entry_id where q.created_at::date between _start_date and _end_date and c.status = 'completed' and ci.deleted_at is null), 0),
      'marginPct', coalesce((select 100 * sum((ci.price - ci.unit_cost) * ci.quantity) / nullif(sum(ci.price * ci.quantity), 0) from consultation_items ci join consultations c on c.id = ci.consultation_id join queue_entries q on q.id = c.queue_entry_id where q.created_at::date between _start_date and _end_date and c.status = 'completed' and ci.deleted_at is null), 0)
    ),
    'visits', jsonb_build_object(
      'registered', (select count(*) from queue_entries where created_at::date between _start_date and _end_date),
      'completed', (select count(*) from queue_entries where created_at::date between _start_date and _end_date and clinic_status = 'completed'),
      'cancelled', (select count(*) from queue_entries where created_at::date between _start_date and _end_date and clinic_status = 'cancelled'),
      'noShow', (select count(*) from queue_entries where created_at::date between _start_date and _end_date and clinic_status::text = 'no_show')
    ),
    'claims', jsonb_build_object(
      'outstandingAmount', coalesce((select sum(amount - coalesce(received_amount, 0)) from panel_claims where claim_date between _start_date and _end_date and status::text not in ('paid', 'rejected', 'written_off')), 0),
      'unsubmittedCount', (select count(*) from panel_claims where claim_date between _start_date and _end_date and submitted_date is null),
      'overdueCount', (select count(*) from panel_claims where due_date < current_date and status::text not in ('paid', 'rejected', 'written_off'))
    ),
    'panelFees', jsonb_build_object(
      'activePanels', (select count(*) from insurance_providers where is_active = true),
      'missingDefaultCount', (select count(*) from insurance_providers where is_active = true and consultation_fee_override is null),
      'mismatchedVisitCount', 0
    ),
    'inventory', jsonb_build_object(
      'outOfStockCount', (select count(*) from inventory_items i where not exists (select 1 from inventory_item_batches b where b.inventory_item_id = i.id and b.quantity_remaining > 0 and b.expiry_date >= current_date)),
      'belowReorderCount', 0,
      'expiring60DaysCount', (select count(distinct inventory_item_id) from inventory_item_batches where quantity_remaining > 0 and expiry_date between current_date and current_date + 60)
    ),
    'dataQuality', jsonb_build_object(
      'completedWithoutPayment', (select count(*) from queue_entries q where q.created_at::date between _start_date and _end_date and q.clinic_status = 'completed' and not exists (select 1 from payments p where p.queue_entry_id = q.id and p.deleted_at is null)),
      'panelVisitWithoutPanel', (select count(*) from queue_entries where created_at::date between _start_date and _end_date and payment_method like 'panel%' and panel_id is null),
      'consultationWithoutFee', (select count(*) from consultations c join queue_entries q on q.id = c.queue_entry_id where q.created_at::date between _start_date and _end_date and c.status = 'completed' and not exists (select 1 from consultation_items ci where ci.consultation_id = c.id and ci.deleted_at is null))
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_clinic_health_metrics(date, date) from public;
grant execute on function public.get_clinic_health_metrics(date, date) to authenticated;
