-- Diagnose the reported case post-retirement: what remains for MRN 1000498 around 2026-08-10?
-- Show each queue entry with its visit_type, source, item totals, and payment totals.
select pm.remedi_mrn,
       qe.id as queue_entry_id,
       qe.visit_type::text as visit_type,
       qe.created_at,
       (qe.clinic_status::text) as qe_status,
       (qe.created_at::date = '2026-08-10') as created_on_aug10,
       (select count(*) from public.consultations c where c.queue_entry_id = qe.id and c.deleted_at is null) as consultations,
       (select coalesce(sum(ci.price * ci.quantity), 0) from public.consultation_items ci where ci.consultation_id in (select id from public.consultations c where c.queue_entry_id = qe.id and c.deleted_at is null) and ci.deleted_at is null) as items_total,
       (select count(*) from public.payments p where p.queue_entry_id = qe.id) as payments_all,
       (select coalesce(sum(p.amount), 0) from public.payments p where p.queue_entry_id = qe.id) as payments_total
from public.queue_entries qe
join private.remedi_patient_map pm on pm.patient_id = qe.patient_id
where pm.remedi_mrn = '1000498'
  and qe.created_at::date between '2026-08-08' and '2026-08-31'
  and qe.deleted_at is null and qe.cancelled_at is null
order by qe.created_at;
