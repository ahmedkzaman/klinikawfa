-- Profile ALL remaining colliding imported encounters (post-retirement).
-- Counts and aggregates only; no identifiers in output.
with colliding as (
  select em.queue_entry_id, em.encounter_hash, em.source_key_hash,
         (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day
  from private.remedi_encounter_map em
  where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and em.reconciliation_status in ('historical_import', 'financial_quarantined')
    and exists (
      select 1 from public.queue_entries l
      where l.patient_id = em.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null)
)
select
  count(*) as colliding_encounters,
  count(*) filter (where (select count(*) from public.payments p where p.queue_entry_id = c.queue_entry_id) > 0) as with_payments,
  (select coalesce(sum(p.amount), 0) from public.payments p join colliding c on p.queue_entry_id = c.queue_entry_id) as imported_payment_total,
  count(*) filter (where (select count(*) from public.panel_claims pc where pc.queue_entry_id = c.queue_entry_id) > 0) as with_claims,
  (select coalesce(sum(pc.amount), 0) from public.panel_claims pc join colliding c on pc.queue_entry_id = c.queue_entry_id) as imported_claim_total,
  count(distinct visit_day) as patient_days
from colliding c;
