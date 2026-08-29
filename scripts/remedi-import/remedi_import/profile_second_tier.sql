-- Categorize ALL still-colliding imported encounters (any non-retired status)
-- by time gap and money relationship to the live side. Counts only.
with colliding as (
  select em.queue_entry_id, em.encounter_hash, em.source_key_hash, em.reconciliation_status,
         em.patient_id,
         (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
         extract(epoch from (min(l.created_at) - em.source_attendance_at))/60 as gap_min,
         (select coalesce(sum(p.amount),0) from public.payments p where p.queue_entry_id = em.queue_entry_id) as imp_pay,
         (select coalesce(sum(pc.amount),0) from public.panel_claims pc where pc.queue_entry_id = em.queue_entry_id) as imp_claim
  from private.remedi_encounter_map em
  join public.queue_entries l on l.patient_id = em.patient_id
    and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date
    and l.visit_type::text <> 'historical_import'
    and l.deleted_at is null and l.cancelled_at is null
  where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and em.reconciliation_status in ('historical_import', 'financial_quarantined', 'financial_paired')
  group by em.queue_entry_id, em.encounter_hash, em.source_key_hash, em.reconciliation_status,
           em.patient_id, em.source_attendance_at
)
select
  reconciliation_status,
  count(*) filter (where gap_min <= 60) as gap_le_1h,
  count(*) filter (where gap_min > 60 and gap_min <= 240) as gap_1_4h,
  count(*) filter (where gap_min > 240) as gap_gt_4h,
  count(*) as total,
  sum(imp_pay + imp_claim)::numeric(12,2) as imported_money_total
from colliding
group by reconciliation_status
order by total desc;
