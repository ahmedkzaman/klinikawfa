-- Check: financial_paired imported encounters colliding with live visits that
-- ALSO carry money (would be missed both-paid duplicates). Counts/aggregates only.
with colliding as (
  select em.queue_entry_id, em.encounter_hash
  from private.remedi_encounter_map em
  where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and em.reconciliation_status = 'financial_paired'
    and exists (
      select 1 from public.queue_entries l
      where l.patient_id = em.patient_id
        and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date
        and l.visit_type::text <> 'historical_import'
        and l.deleted_at is null and l.cancelled_at is null)
)
select
  count(*) as colliding_financial_paired,
  count(*) filter (where (select coalesce(sum(p.amount),0) from public.payments p where p.queue_entry_id = c.queue_entry_id) > 0) as imp_with_payments,
  (select coalesce(sum(p.amount),0) from public.payments p join colliding c on p.queue_entry_id = c.queue_entry_id) as imp_payment_total,
  count(*) filter (where (select count(*) from public.panel_claims pc where pc.queue_entry_id = c.queue_entry_id) > 0) as imp_with_claims,
  (select coalesce(sum(pc.amount),0) from public.panel_claims pc join colliding c on pc.queue_entry_id = c.queue_entry_id) as imp_claim_total
from colliding c;
