-- Postflight: verify the reported case and money conservation. Counts + aggregates only.
-- 1) MRN 1000498 on 2026-08-10: exactly ONE visit should remain (the live one at RM70).
select 'reported_case' as check,
       count(*) as visits_on_day,
       coalesce(sum(p.amount), 0) as total_paid
from public.queue_entries qe
join private.remedi_patient_map pm on pm.patient_id = qe.patient_id
left join public.payments p on p.queue_entry_id = qe.id and p.deleted_at is null
where pm.remedi_mrn = '1000498'
  and qe.created_at::date = '2026-08-10'
  and qe.deleted_at is null and qe.cancelled_at is null
group by pm.remedi_mrn;
