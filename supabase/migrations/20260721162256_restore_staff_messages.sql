create table public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  receiver_id uuid references auth.users(id) on delete cascade
);

alter table public.staff_messages enable row level security;

revoke all on table public.staff_messages from public;
revoke all on table public.staff_messages from anon;
revoke all on table public.staff_messages from authenticated;
grant select, insert on table public.staff_messages to authenticated;
grant all on table public.staff_messages to service_role;

create policy staff_messages_staff_read
on public.staff_messages for select to authenticated
using (
  public.is_staff_or_clinical((select auth.uid()))
  and (
    receiver_id is null
    or (select auth.uid()) = sender_id
    or receiver_id = (select auth.uid())
  )
);

create policy staff_messages_staff_send
on public.staff_messages for insert to authenticated
with check (
  public.is_staff_or_clinical((select auth.uid()))
  and (select auth.uid()) = sender_id
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_messages'
  ) then
    alter publication supabase_realtime add table public.staff_messages;
  end if;
end
$$;
