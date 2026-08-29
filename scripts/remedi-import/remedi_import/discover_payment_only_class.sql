-- Discover the payment_only import class: imported payment_only queue entries
-- colliding with same-day live visits. Counts + aggregates only.
with imported_po as (
  -- payment_only queue entries created by the Remedi import: linked via invoice map
  select im.queue_entry_id, im.patient_id, im.bill_number, im.reconciliation_status,
         im.gross_amount,
         (qe.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day
  from private.remedi_invoice_map im
  join public.queue_entries qe on qe.id = im.queue_entry_id
  where im.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and qe.visit_type::text = 'payment_only'
    and qe.deleted_at is null and qe.cancelled_at is null
)
select
  count(*) as imported_payment_only,
  count(*) filter (where exists (
    select 1 from public.queue_entries l
    where l.patient_id = i.patient_id
      and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
      and l.visit_type::text in ('consultation','direct_sale')
      and l.deleted_at is null and l.cancelled_at is null
  )) as colliding_with_live_same_day,
  (select coalesce(sum(gross_amount),0) from imported_po where exists (
    select 1 from public.queue_entries l
    where l.patient_id = imported_po.patient_id
      and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = imported_po.visit_day
      and l.visit_type::text in ('consultation','direct_sale')
      and l.deleted_at is null and l.cancelled_at is null)) as colliding_gross_total
from imported_po i;
