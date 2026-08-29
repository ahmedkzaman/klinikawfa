-- Profile the 27 cancelled-live pairs + the 9 B-bucket pairs: amounts, items, gap.
-- Counts only (no identifiers).
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
    select i.imp_qe, i.imp_c, l.live_qe, l.clinic_status as live_status,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes,
           i.visit_day
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
)
select
    case when live_status = 'cancelled' then 'cancelled_live'
         when live_status = 'completed' then 'completed_live'
         else 'other_live' end as status_class,
    case
        when exists (select 1 from public.payments p where p.queue_entry_id = p2.live_qe) then 'live_has_payment'
        else 'live_unpaid'
    end as live_money,
    case
        when exists (select 1 from public.payments p where p.queue_entry_id = p2.imp_qe) then 'imp_has_payment'
        else 'imp_unpaid'
    end as imp_money,
    count(*) as pairs,
    count(*) filter (where gap_minutes <= 240) as within_240
from pairs p2
group by 1, 2, 3
order by 1, 2, 3;
