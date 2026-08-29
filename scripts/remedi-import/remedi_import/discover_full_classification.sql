-- Full classification table: pair count per (payment_bucket × amount_class × doctor_match × gap_window).
-- Counts only. This drives the Task 3 retirement classification.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id,
           em.consultation_id,
           em.source_doctor_names
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
    select i.patient_id, i.visit_day,
           i.consultation_id as imported_consultation_id,
           i.queue_entry_id as imported_queue_entry_id,
           i.source_doctor_names,
           l.live_queue_entry_id,
           l.created_at as live_created_at,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
item_totals as (
    select p.*,
           (select coalesce(sum(ci.price * coalesce(ci.quantity, 1)), 0)
            from public.consultation_items ci
            where ci.consultation_id = p.imported_consultation_id and ci.deleted_at is null) as imported_item_total,
           coalesce((select sum(ci.price * coalesce(ci.quantity, 1))
            from public.consultation_items ci
            where ci.consultation_id = c.id and ci.deleted_at is null), 0) as live_item_total,
           c.doctor_id as live_doctor_id,
           c.id as live_consultation_id
    from pairs p
    left join public.consultations c on c.queue_entry_id = p.live_queue_entry_id
),
pay as (
    select it.*,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = it.imported_queue_entry_id) as imp_pay_count,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = it.live_queue_entry_id) as live_pay_count,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = it.imported_queue_entry_id) as imp_claim_count,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = it.live_queue_entry_id) as live_claim_count
    from item_totals it
),
classified as (
    select pay.*,
           case
               when live_pay_count = 0 and imp_pay_count = 0 then 'A_no_payments_either'
               when live_pay_count = 0 and imp_pay_count > 0 then 'B_imp_paid_live_unpaid'
               when live_pay_count > 0 and imp_pay_count = 0 then 'C_live_paid_imp_unpaid'
               else 'D_paid_both_sides'
           end as pay_bucket,
           case when imported_item_total = live_item_total then 'equal' else 'diff' end as amt_class,
           case when gap_minutes <= 240 then 'within_240' else 'beyond_240' end as gap_class,
           case
               when live_doctor_id is null then 'no_live_doctor'
               when source_doctor_names = '{}' then 'no_imp_doctor'
               else 'has_doctors_both'
           end as doctor_info
    from pay
)
select pay_bucket, amt_class, gap_class, doctor_info,
       count(*) as pairs
from classified
group by 1, 2, 3, 4
order by 1, 2, 3, 4;
