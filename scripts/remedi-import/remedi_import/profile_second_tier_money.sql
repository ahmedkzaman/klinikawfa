-- For the 102 financial_paired collisions: does the live side ALSO have money?
-- Both-paid = true duplicate money still in production. Counts only.
with colliding as (
  select em.queue_entry_id, em.encounter_hash, em.source_key_hash,
         em.patient_id,
         (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day
  from private.remedi_encounter_map em
  where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and em.reconciliation_status = 'financial_paired'
    and exists (
      select 1 from public.queue_entries l
      where l.patient_id = em.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null)
)
select
  count(*) as pairs,
  count(*) filter (where imp_pay > 0 and live_pay > 0) as both_have_payments,
  count(*) filter (where imp_claim > 0 and live_claim > 0) as both_have_claims,
  count(*) filter (where imp_money > 0 and live_money > 0) as both_sides_paid_any,
  count(*) filter (where imp_money > 0 and live_money = 0) as only_imported_paid,
  count(*) filter (where imp_money = 0 and live_money > 0) as only_live_paid,
  count(*) filter (where imp_money = 0 and live_money = 0) as neither_paid,
  sum(imp_money)::numeric(12,2) as total_imported_money,
  sum(imp_money) filter (where imp_money > 0 and live_money > 0)::numeric(12,2) as duplicated_imported_money
from (
  select c.*,
    (select coalesce(sum(p.amount),0) from public.payments p where p.queue_entry_id = c.queue_entry_id) as imp_pay,
    (select coalesce(sum(pc.amount),0) from public.panel_claims pc where pc.queue_entry_id = c.queue_entry_id) as imp_claim,
    (select coalesce(sum(p.amount),0) from public.payments p join public.queue_entries l on p.queue_entry_id = l.id
      where l.patient_id = c.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = c.visit_day
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null) as live_pay,
    (select coalesce(sum(pc.amount),0) from public.panel_claims pc join public.queue_entries l on pc.queue_entry_id = l.id
      where l.patient_id = c.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = c.visit_day
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null) as live_claim,
    ((select coalesce(sum(p.amount),0) from public.payments p where p.queue_entry_id = c.queue_entry_id)
     + (select coalesce(sum(pc.amount),0) from public.panel_claims pc where pc.queue_entry_id = c.queue_entry_id)) as imp_money,
    ((select coalesce(sum(p.amount),0) from public.payments p join public.queue_entries l on p.queue_entry_id = l.id
      where l.patient_id = c.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = c.visit_day
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null)
     + (select coalesce(sum(pc.amount),0) from public.panel_claims pc join public.queue_entries l on pc.queue_entry_id = l.id
      where l.patient_id = c.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = c.visit_day
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null)) as live_money
  from colliding c
) x;
