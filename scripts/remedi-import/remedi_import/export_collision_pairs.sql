-- Export collision pairs for local classification against the insights golden truth.
-- PHI (MRN + timestamps): target file lives OUTSIDE the Git tree; never commit.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id as imp_qe,
           em.consultation_id as imp_c,
           em.source_doctor_names,
           em.encounter_hash,
           em.source_key_hash,
           pm.remedi_mrn
    from private.remedi_encounter_map em
    join private.remedi_patient_map pm
      on pm.batch_id = em.batch_id and pm.patient_id = em.patient_id
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at as live_created_at,
           q.id as live_qe,
           q.visit_type as live_vt,
           q.clinic_status::text as live_status
    from public.queue_entries q
    where q.visit_type in ('consultation','direct_sale')
      and q.patient_id is not null
      and not exists (
        select 1 from private.remedi_encounter_map m
        where m.queue_entry_id = q.id and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.remedi_mrn, i.visit_day, i.encounter_hash, i.source_key_hash,
           i.imp_qe, i.imp_c, i.source_attendance_at, i.source_doctor_names,
           l.live_qe, l.live_created_at, l.live_vt, l.live_status,
           abs(extract(epoch from (l.live_created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
enriched as (
    select p.remedi_mrn, p.visit_day, p.encounter_hash, p.source_key_hash,
           p.imp_qe, p.imp_c, p.source_attendance_at, p.source_doctor_names,
           p.live_qe, p.live_created_at, p.live_vt, p.live_status, p.gap_minutes,
           (select coalesce(sum(ci.price * coalesce(ci.quantity,1)),0)
            from public.consultation_items ci
            where ci.consultation_id = p.imp_c and ci.deleted_at is null) as imp_item_total,
           coalesce((select sum(ci.price * coalesce(ci.quantity,1))
            from public.consultation_items ci
            join public.consultations c on c.id = ci.consultation_id
            where c.queue_entry_id = p.live_qe and ci.deleted_at is null and c.deleted_at is null), 0) as live_item_total,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.imp_qe) as imp_pay_count,
           (select coalesce(sum(pay.amount),0) from public.payments pay where pay.queue_entry_id = p.imp_qe) as imp_pay_total,
           (select count(*) from public.payments pay where pay.queue_entry_id = p.live_qe) as live_pay_count,
           (select coalesce(sum(pay.amount),0) from public.payments pay where pay.queue_entry_id = p.live_qe) as live_pay_total,
           (select count(*) from public.panel_claims pc where pc.queue_entry_id = p.imp_qe) as imp_claim_count,
           (select count(*) from public.panel_claims pc where pc.queue_entry_id = p.live_qe) as live_claim_count
    from pairs p
)
select e.remedi_mrn as mrn,
       to_char(e.visit_day, 'YYYY-MM-DD') as visit_day,
       e.encounter_hash,
       e.source_key_hash,
       e.imp_qe::text,
       e.imp_c::text,
       to_char(e.source_attendance_at, 'YYYY-MM-DD HH24:MI:SS') as imp_at,
       e.source_doctor_names::text as imp_doctors,
       e.live_qe::text,
       to_char(e.live_created_at, 'YYYY-MM-DD HH24:MI:SS') as live_at,
       e.live_vt, e.live_status,
       round(e.gap_minutes::numeric, 1) as gap_min,
       round(e.imp_item_total, 2) as imp_items,
       round(e.live_item_total, 2) as live_items,
       e.imp_pay_count, round(e.imp_pay_total, 2) as imp_paid,
       e.live_pay_count, round(e.live_pay_total, 2) as live_paid,
       e.imp_claim_count, e.live_claim_count
from enriched e
order by e.remedi_mrn, e.visit_day, e.source_attendance_at;
