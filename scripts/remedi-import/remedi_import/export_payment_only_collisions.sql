-- Export the 98 colliding payment_only imports with live-side detail for
-- local truth-matching. PHI goes to the local secure directory only.
with imported_po as (
  select im.queue_entry_id, im.patient_id, im.bill_number, im.reconciliation_status,
         im.gross_amount,
         (qe.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
         qe.created_at as imported_at
  from private.remedi_invoice_map im
  join public.queue_entries qe on qe.id = im.queue_entry_id
  where im.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
    and qe.visit_type::text = 'payment_only'
    and qe.deleted_at is null and qe.cancelled_at is null
)
select
  pm.remedi_mrn,
  i.visit_day::text,
  i.queue_entry_id::text as imp_qe,
  i.bill_number,
  i.gross_amount,
  (select count(*) from public.queue_entries l
     where l.patient_id = i.patient_id
       and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
       and l.visit_type::text in ('consultation','direct_sale')
       and l.deleted_at is null and l.cancelled_at is null) as live_visits,
  (select coalesce(sum(ci.price*ci.quantity),0) from public.consultation_items ci
     join public.consultations c on ci.consultation_id = c.id
     join public.queue_entries l on c.queue_entry_id = l.id
     where l.patient_id = i.patient_id
       and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
       and l.visit_type::text in ('consultation','direct_sale')
       and l.deleted_at is null and l.cancelled_at is null) as live_items_total,
  (select min(abs(extract(epoch from (l.created_at - i.imported_at))/60))
     from public.queue_entries l
     where l.patient_id = i.patient_id
       and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
       and l.visit_type::text in ('consultation','direct_sale')
       and l.deleted_at is null and l.cancelled_at is null) as gap_min,
  (select (l.clinic_status::text)
     from public.queue_entries l
     where l.patient_id = i.patient_id
       and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
       and l.visit_type::text in ('consultation','direct_sale')
       and l.deleted_at is null and l.cancelled_at is null
     order by abs(extract(epoch from (l.created_at - i.imported_at))) limit 1) as live_status
from imported_po i
join private.remedi_patient_map pm on pm.patient_id = i.patient_id
where exists (
  select 1 from public.queue_entries l
  where l.patient_id = i.patient_id
    and (l.created_at at time zone 'Asia/Kuala_Lumpur')::date = i.visit_day
    and l.visit_type::text in ('consultation','direct_sale')
    and l.deleted_at is null and l.cancelled_at is null)
order by pm.remedi_mrn, i.visit_day;
