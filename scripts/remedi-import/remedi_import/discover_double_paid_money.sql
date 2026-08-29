-- D-bucket (paid both sides) money comparison + payment/claim shape. Counts only.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id as imported_queue_entry_id,
           em.consultation_id as imported_consultation_id
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at,
           q.id as live_queue_entry_id
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
    select i.*, l.live_queue_entry_id,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
d_paid_both as (
    select p.*,
           (select coalesce(sum(pay.amount), 0) from public.payments pay
             where pay.queue_entry_id = p.imported_queue_entry_id) as imp_pay_total,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = p.imported_queue_entry_id) as imp_pay_count,
           (select coalesce(sum(pay.amount), 0) from public.payments pay
             where pay.queue_entry_id = p.live_queue_entry_id) as live_pay_total,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = p.live_queue_entry_id) as live_pay_count,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = p.imported_queue_entry_id) as imp_claim_count,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = p.live_queue_entry_id) as live_claim_count
    from pairs p
    where exists (select 1 from public.payments x where x.queue_entry_id = p.imported_queue_entry_id)
      and exists (select 1 from public.payments y where y.queue_entry_id = p.live_queue_entry_id)
)
select
    case
        when imp_pay_total = live_pay_total then 'payment_totals_equal'
        when imp_pay_total > live_pay_total then 'imported_pays_more'
        else 'live_pays_more'
    end as money_compare,
    case when imp_pay_count = 1 and live_pay_count = 1 then '1_and_1'
         when imp_pay_count = 1 and live_pay_count > 1 then '1_vs_many'
         when imp_pay_count > 1 and live_pay_count = 1 then 'many_vs_1'
         else 'many_vs_many' end as pay_shape,
    case when imp_claim_count > 0 then 'imp_has_claim' else 'imp_no_claim' end as claim_shape,
    count(*) as pairs,
    count(*) filter (where gap_minutes <= 240) as within_240,
    round(sum(imp_pay_total - live_pay_total), 2) as total_excess_rm
from d_paid_both
group by 1, 2, 3
order by 1, 2, 3;
