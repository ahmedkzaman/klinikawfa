-- Enrich collision pairs with panel-claim amount sums (for the 418 imp1_live1 pairs).
-- Amounts flow into the local secure export only.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id as imp_qe,
           em.consultation_id as imp_c,
           pm.remedi_mrn
    from private.remedi_encounter_map em
    join private.remedi_patient_map pm
      on pm.batch_id = em.batch_id and pm.patient_id = em.patient_id
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.id as live_qe
    from public.queue_entries q
    where q.visit_type in ('consultation','direct_sale')
      and q.patient_id is not null
      and not exists (
        select 1 from private.remedi_encounter_map m
        where m.queue_entry_id = q.id and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.remedi_mrn, i.visit_day, i.imp_qe, l.live_qe
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
)
select p.remedi_mrn as mrn,
       to_char(p.visit_day, 'YYYY-MM-DD') as visit_day,
       p.imp_qe::text as imp_qe,
       p.live_qe::text as live_qe,
       (select count(*) from public.panel_claims pc where pc.queue_entry_id = p.imp_qe) as imp_claims,
       (select coalesce(sum(pc.amount),0) from public.panel_claims pc where pc.queue_entry_id = p.imp_qe) as imp_claim_amt,
       (select count(*) from public.panel_claims pc where pc.queue_entry_id = p.live_qe) as live_claims,
       (select coalesce(sum(pc.amount),0) from public.panel_claims pc where pc.queue_entry_id = p.live_qe) as live_claim_amt
from pairs p
where exists (select 1 from public.panel_claims pc where pc.queue_entry_id = p.imp_qe)
   or exists (select 1 from public.panel_claims pc where pc.queue_entry_id = p.live_qe)
order by p.remedi_mrn, p.visit_day;
