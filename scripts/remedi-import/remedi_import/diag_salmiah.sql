-- Diagnose the Salmiah binti Ayob case: all imported + live visits with amounts.
-- Cross-day duplicate candidate. MRN/name via patient map.
select
  qe.id as queue_entry_id,
  qe.visit_type::text as visit_type,
  qe.clinic_status::text as status,
  qe.created_at,
  (select string_agg(distinct d.name, ', ')
     from public.consultations c join public.doctors d on d.id = c.doctor_id
     where c.queue_entry_id = qe.id) as doctors,
  (select coalesce(sum(ci.price * ci.quantity), 0)
     from public.consultation_items ci
     join public.consultations c on ci.consultation_id = c.id
     where c.queue_entry_id = qe.id and ci.deleted_at is null) as items_total,
  (select count(*) from public.payments p where p.queue_entry_id = qe.id) as payments,
  (select count(*) from public.panel_claims pc where pc.queue_entry_id = qe.id) as claims
from public.queue_entries qe
where qe.patient_id in (select patient_id from public.patients where name ilike '%Salmiah%Ayob%')
  and qe.deleted_at is null and qe.cancelled_at is null
order by qe.created_at desc
limit 20;
