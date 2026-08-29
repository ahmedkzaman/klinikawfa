-- Classify the 98 colliding payment_only imports: is the imported amount covered
-- by the live same-day visit(s)? Exportable detail (PHI stays local/secure).
with imported_po as (
  select im.queue_entry_id, im.patient_id, im.bill_number, im.reconciliation_status,
         im.gross_amount,
         (qe.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
         qe.created_at as imported_at
  from private.remedi_invoice_map im
  join public.queue_entries qe on qe.id = im.queue_entry_id
  where im.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and qe.visit_type::text = 'payment_only'
    and qe.deleted_at is null and qe.cancelled_at is null
),
with_live as (
  select i.*,
    (select coalesce(sum(l_items.t),0) from (
       select (select coalesce(sum(ci.price*ci.quantity),0) from public.consultation_items ci
               join public.consultations c on ci.consultation_id=c.id
               where c.queue_entry_id = l.id and ci.deleted_at is null) as t
       from public.queue_entries l
       where l.patient_id = i.patient_id
         and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
         and l.visit_type::text in ('consultation','direct_sale')
         and l.deleted_at is null and l.cancelled_at is null
     ) l_items) as live_items_total,
    (select count(*) from public.queue_entries l
       where l.patient_id = i.patient_id
         and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
         and l.visit_type::text in ('consultation','direct_sale')
         and l.deleted_at is null and l.cancelled_at is null) as live_visits,
    (select min(abs(extract(epoch from (l.created_at - i.imported_at))/60))
       from public.queue_entries l
       where l.patient_id = i.patient_id
         and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
         and l.visit_type::text in ('consultation','direct_sale')
         and l.deleted_at is null and l.cancelled_at is null) as min_gap_min
  from imported_po i
  where exists (
    select 1 from public.queue_entries l
    where l.patient_id = i.patient_id
      and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
      and l.visit_type::text in ('consultation','direct_sale')
      and l.deleted_at is null and l.cancelled_at is null)
)
select
  count(*) as total,
  count(*) filter (where live_items_total >= gross_amount) as live_covers_amount,
  count(*) filter (where live_items_total = gross_amount) as exact_amount_match,
  count(*) filter (where live_items_total < gross_amount) as live_under_covers,
  count(*) filter (where live_visits = 1) as single_live_visit,
  count(*) filter (where min_gap_min <= 240) as gap_le_4h,
  sum(gross_amount) filter (where live_items_total >= gross_amount)::numeric(12,2) as money_when_covered,
  sum(gross_amount) filter (where live_items_total < gross_amount)::numeric(12,2) as money_when_not_covered
from with_live;
