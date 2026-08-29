-- Cross-day collision sweep: imported encounters whose amount matches a live
-- visit within +/- 1 day but NOT the same day (the class same-day detection missed).
-- Counts only.
with imported as (
  select em.queue_entry_id, em.patient_id, em.reconciliation_status,
         (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day
  from private.remedi_encounter_map em
  where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and em.reconciliation_status in ('historical_import', 'financial_quarantined', 'financial_paired')
),
imp_amounts as (
  select i.*,
    (select coalesce(sum(ci.price*ci.quantity),0) from public.consultation_items ci
      join public.consultations c on ci.consultation_id = c.id
      where c.queue_entry_id = i.queue_entry_id and ci.deleted_at is null) as imp_items
  from imported i
),
crossday as (
  select a.queue_entry_id, a.patient_id, a.visit_day, a.imp_items, l.id as live_qe, l.created_at,
         (l.created_at at time zone 'Asia/Kuala_Lumpur')::date as live_day
  from imp_amounts a
  join public.queue_entries l on l.patient_id = a.patient_id
    and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date between a.visit_day - 1 and a.visit_day + 1
    and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date <> a.visit_day
    and l.visit_type::text in ('consultation','direct_sale')
    and l.deleted_at is null and l.cancelled_at is null
  where a.imp_items > 0
)
select
  count(*) as cross_day_amount_matches,
  count(distinct queue_entry_id) as distinct_imported,
  count(*) filter (where imp_items = (select coalesce(sum(ci.price*ci.quantity),0) from public.consultation_items ci
      join public.consultations c on ci.consultation_id = c.id
      where c.queue_entry_id = live_qe and ci.deleted_at is null)) as exact_amount_match
from crossday;
