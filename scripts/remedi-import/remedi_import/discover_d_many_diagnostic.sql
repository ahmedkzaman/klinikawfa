-- Diagnose the 1_vs_many D-bucket: live visit_type, multi-pair inflation, payment count distribution. Counts only.
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
           l.live_queue_entry_id, l.visit_type as live_visit_type, l.created_at as live_created_at
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
counts as (
    select p.*,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.imported_queue_entry_id) as imp_pay_count,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.live_queue_entry_id) as live_pay_count,
           (select coalesce(sum(pay.amount), 0) from public.payments pay where pay.queue_entry_id = p.imported_queue_entry_id) as imp_pay_total,
           (select coalesce(sum(pay.amount), 0) from public.payments pay where pay.queue_entry_id = p.live_queue_entry_id) as live_pay_total
    from pairs p
),
d_many as (
    select * from counts
    where imp_pay_count > 0 and live_pay_count > 0
      and imp_pay_count = 1 and live_pay_count > 1
)
select 'd_many_pairs' as metric, count(*)::text as value from d_many
union all select 'd_many_distinct_patient_days', count(distinct (patient_id, visit_day))::text from d_many
union all select 'd_many_distinct_imported_qe', count(distinct imported_queue_entry_id)::text from d_many
union all select 'd_many_distinct_live_qe', count(distinct live_queue_entry_id)::text from d_many
union all select 'd_many_live_type_consultation', count(*)::text from d_many where live_visit_type = 'consultation'
union all select 'd_many_live_type_direct_sale', count(*)::text from d_many where live_visit_type = 'direct_sale'
union all select 'd_many_live_paycount_2', count(*)::text from d_many where live_pay_count = 2
union all select 'd_many_live_paycount_3plus', count(*)::text from d_many where live_pay_count >= 3
union all select 'd_many_imp_eq_live_money', count(*)::text from d_many where imp_pay_total = live_pay_total
union all select 'd_many_imp_in_live_money', count(*)::text from d_many where live_pay_total > imp_pay_total
union all select 'd_many_max_live_paycount', max(live_pay_count)::text from d_many
union all select 'd_many_median_live_paycount', round(percentile_cont(0.5) within group (order by live_pay_count)::numeric, 1)::text from d_many
order by metric;
