-- Confirm the reported patient case fits the classification pattern.
-- This query joins through the private map and public rows but outputs COUNTS ONLY.
-- It identifies the imported encounter_hash (hash, not patient-identifying) for review.
with target_imported as (
    select em.encounter_hash, em.source_key_hash, em.queue_entry_id as imp_qe,
           em.consultation_id as imp_consult, em.source_attendance_at,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.patient_id
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      and em.source_attendance_at
          between '2026-08-10 00:00:00+08' and '2026-08-10 23:59:59+08'
)
select 'imported_encounters_on_10aug' as metric, count(*)::text as value
from private.remedi_encounter_map em
where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
  and em.source_attendance_at between '2026-08-10 00:00:00+08' and '2026-08-10 23:59:59+08'
union all
select 'imported_with_same_day_live', count(*)::text
from target_imported ti
where exists (
    select 1 from public.queue_entries q
    where q.visit_type in ('consultation','direct_sale')
      and q.patient_id = ti.patient_id
      and (q.created_at at time zone 'Asia/Kuala_Lumpur')::date = ti.visit_day
      and not exists (select 1 from private.remedi_encounter_map m
                      where m.queue_entry_id = q.id and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d')
)
union all
select 'imported_with_same_day_live_le_30min', count(*)::text
from target_imported ti
where exists (
    select 1 from public.queue_entries q
    where q.visit_type in ('consultation','direct_sale')
      and q.patient_id = ti.patient_id
      and (q.created_at at time zone 'Asia/Kuala_Lumpur')::date = ti.visit_day
      and abs(extract(epoch from (q.created_at - ti.source_attendance_at)))/60.0 <= 30
      and not exists (select 1 from private.remedi_encounter_map m
                      where m.queue_entry_id = q.id and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d')
)
order by metric;
