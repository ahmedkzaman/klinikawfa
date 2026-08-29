-- For the 1-vs-many bucket: how often is the imported payment amount a perfect subset
-- of the live payments (same amount AND same method)? Counts only.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id as imported_queue_entry_id
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at,
           q.id as live_queue_entry_id,
           q.visit_type
    from public.queue_entries q
    where q.visit_type in ('consultation', 'direct_sale')
      and q.patient_id is not null
      and not exists (
            select 1 from private.remedi_encounter_map m
            where m.queue_entry_id = q.id
              and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.patient_id, i.visit_day, i.imported_queue_entry_id, i.source_attendance_at,
           l.live_queue_entry_id
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
d_many as (
    select p.*,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.imported_queue_entry_id) as imp_pay_count,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.live_queue_entry_id) as live_pay_count
    from pairs p
    where exists (select 1 from public.payments x where x.queue_entry_id = p.imported_queue_entry_id)
      and exists (select 1 from public.payments y where y.queue_entry_id = p.live_queue_entry_id)
      and (select count(*) from public.payments pay where pay.queue_entry_id = p.imported_queue_entry_id) = 1
      and (select count(*) from public.payments pay where pay.queue_entry_id = p.live_queue_entry_id) > 1
),
-- For each d_many pair: pull the single imported payment amount+method and check if
-- an exact match exists on the live side.
checks as (
    select dm.*,
           (select pay.amount from public.payments pay where pay.queue_entry_id = dm.imported_queue_entry_id limit 1) as imp_amt,
           (select pay.payment_method from public.payments pay where pay.queue_entry_id = dm.imported_queue_entry_id limit 1) as imp_method,
           (select count(*) from public.payments lp
             where lp.queue_entry_id = dm.live_queue_entry_id
               and lp.amount = (select pay.amount from public.payments pay where pay.queue_entry_id = dm.imported_queue_entry_id limit 1)
               and lp.payment_method = (select pay.payment_method from public.payments pay where pay.queue_entry_id = dm.imported_queue_entry_id limit 1)
           ) as exact_match_count
    from d_many dm
)
select
    case when exact_match_count > 0 then 'imported_payment_exactly_in_live'
         else 'imported_payment_not_in_live' end as subset_status,
    count(*) as pairs
from checks
group by 1;
