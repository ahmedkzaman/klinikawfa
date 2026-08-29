-- Month histogram + per-month pattern breakdown for live-vs-imported collisions. Counts only.
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
           q.id as queue_entry_id,
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
           i.source_attendance_at,
           l.created_at as live_created_at,
           l.queue_entry_id as live_queue_entry_id,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
)
select to_char(visit_day, 'YYYY-MM') as month,
       count(*) as pairs,
       count(*) filter (where gap_minutes <= 30) as gap_le_30,
       count(*) filter (where gap_minutes > 30 and gap_minutes <= 240) as gap_31_240,
       count(*) filter (where gap_minutes > 240) as gap_gt_240,
       round(min(gap_minutes)::numeric, 1) as gap_min,
       round(percentile_cont(0.5) within group (order by gap_minutes)::numeric, 1) as gap_median,
       round(max(gap_minutes)::numeric, 1) as gap_max
from pairs
group by 1
order by 1;
