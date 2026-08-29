-- Live visit status breakdown for the collision pairs — determines which
-- retirement subcase is reachable. Counts only.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at, em.queue_entry_id as imp_qe, em.consultation_id as imp_c
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at, q.id as live_qe, q.visit_type, q.clinic_status
    from public.queue_entries q
    where q.visit_type in ('consultation','direct_sale')
      and q.patient_id is not null
      and not exists (
        select 1 from private.remedi_encounter_map m
        where m.queue_entry_id = q.id and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.imp_qe, i.imp_c, l.live_qe, l.clinic_status as live_status, l.visit_type as live_vt,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
)
select coalesce(live_status::text, 'null') as live_status, count(*) as pairs,
       count(*) filter (where gap_minutes <= 240) as within_240
from pairs
group by 1
order by 1;
