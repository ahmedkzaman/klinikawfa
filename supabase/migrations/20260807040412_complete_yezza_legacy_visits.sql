begin;

set local lock_timeout = '30s';
set local statement_timeout = 0;

-- These are historical records, not live workflow transitions. Running the
-- ordinary completion triggers here would fabricate financial snapshots and
-- panel claims for data whose payments were intentionally not imported.
set local session_replication_role = replica;

update public.consultations as consultation
set status = 'completed'
where consultation.entry_source = 'legacy_import'
  and consultation.status is distinct from 'completed'
  and exists (
    select 1
    from public.visit_external_ids as external_visit
    where external_visit.source_system = 'yezza'
      and external_visit.queue_entry_id = consultation.queue_entry_id
  );

update public.queue_entries as queue_entry
set clinic_status = 'completed'
where queue_entry.clinic_status is distinct from 'completed'::public.clinic_status
  and exists (
    select 1
    from public.visit_external_ids as external_visit
    where external_visit.source_system = 'yezza'
      and external_visit.queue_entry_id = queue_entry.id
  );

set local session_replication_role = origin;

do $repair_check$
begin
  if exists (
    select 1
    from public.visit_external_ids as external_visit
    join public.queue_entries as queue_entry
      on queue_entry.id = external_visit.queue_entry_id
    where external_visit.source_system = 'yezza'
      and queue_entry.clinic_status is distinct from 'completed'::public.clinic_status
  ) or exists (
    select 1
    from public.visit_external_ids as external_visit
    join public.consultations as consultation
      on consultation.queue_entry_id = external_visit.queue_entry_id
    where external_visit.source_system = 'yezza'
      and consultation.entry_source = 'legacy_import'
      and consultation.status is distinct from 'completed'
  ) then
    raise exception 'YEZZA_LEGACY_VISIT_REPAIR_INCOMPLETE';
  end if;
end
$repair_check$;

commit;
