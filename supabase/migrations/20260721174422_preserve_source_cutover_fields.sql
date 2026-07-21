alter type public.clinic_status add value if not exists 'cancelled';

alter table public.appointments
  add column if not exists patient_ic text,
  add column if not exists service_slug text,
  add column if not exists payment_reference text,
  add column if not exists updated_at timestamp with time zone default now();

alter table public.queue_entries
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text,
  add column if not exists queue_sequence integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_service_slug_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_service_slug_fkey
      foreign key (service_slug) references public.clinic_services(slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.queue_entries'::regclass
      and conname = 'queue_entries_cancelled_by_fkey'
  ) then
    alter table public.queue_entries
      add constraint queue_entries_cancelled_by_fkey
      foreign key (cancelled_by) references auth.users(id);
  end if;
end
$$;
