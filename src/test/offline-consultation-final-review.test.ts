import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const finalMigrationName = readdirSync(migrationDirectory)
  .find((file) => file.endsWith('_close_offline_consultation_final_review.sql'));
const finalMigrationPath = finalMigrationName
  ? join(migrationDirectory, finalMigrationName)
  : '';
const finalSql = finalMigrationPath ? readFileSync(finalMigrationPath, 'utf8') : '';
const hardeningMigrationPath = resolve(
  migrationDirectory,
  '20260802233000_harden_offline_consultation_entry.sql',
);
const attachmentDeleteMigrationPath = resolve(
  migrationDirectory,
  '20260802233100_fix_offline_attachment_delete_and_discovery.sql',
);
const dispensaryMigrationPath = resolve(
  migrationDirectory,
  '20260725163000_guard_dispensary_quantity_updates.sql',
);

const postgresBin = process.env.POSTGRES_BIN
  ?? 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const initdb = join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
const pgCtl = join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const psqlBinary = join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql');
const hasPostgres = [initdb, pgCtl, psqlBinary].every(existsSync);
const requiresPostgres = process.env.REQUIRE_POSTGRES_TEST === '1' || process.env.CI === 'true';

describe('offline consultation final review contract', () => {
  it('defines all six final-review database fixes in one additive migration', () => {
    expect(finalMigrationName).toBeDefined();
    expect(finalSql).toMatch(
      /create unique index if not exists consultations_queue_entry_id_active_uidx[\s\S]*queue_entry_id[\s\S]*where deleted_at is null/i,
    );

    const saveRpc = finalSql.match(
      /create or replace function public\.save_offline_consultation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(saveRpc).toMatch(/p_expected_revision is null[\s\S]*duplicate_offline_consultation/i);
    expect(saveRpc).toMatch(/p_expected_revision is not null[\s\S]*stale_offline_consultation/i);
    expect(saveRpc).not.toMatch(/and doctor\.on_duty/i);

    const eligibility = finalSql.match(
      /create or replace function public\.is_eligible_offline_consultation_doctor[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(eligibility).toMatch(/doctor\.status::text = 'active'/i);
    expect(eligibility).toMatch(/'resident_doctor', 'doctor_admin'/i);
    expect(eligibility).not.toMatch(/on_duty/i);

    const relatedGuard = finalSql.match(
      /create or replace function public\.guard_offline_consultation_related_write[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(relatedGuard).toMatch(/old_consultation_id/i);
    expect(relatedGuard).toMatch(/new_consultation_id/i);
    expect(relatedGuard).toMatch(/for update/i);
    expect(relatedGuard).toMatch(/dispensed_qty/i);
    expect(relatedGuard).toMatch(/partial_reason/i);
    expect(relatedGuard).toMatch(/can_edit_dispensary_prices/i);

    expect(finalSql).toMatch(/create table private\.offline_consultation_attachment_reservations/i);
    expect(finalSql).toMatch(/reserve_offline_consultation_attachment/i);
    expect(finalSql).toMatch(/finalize_offline_consultation_attachment/i);
    expect(finalSql).toMatch(/cancel_offline_consultation_attachment_upload/i);
    expect(finalSql).toMatch(/offline_consultation_attachment_upload_pending/i);
    expect(finalSql).toMatch(/create policy "visit_attachment_insert"[\s\S]*offline_consultation_attachment/i);
    expect(finalSql).toMatch(/create policy "visit_attachment_read"[\s\S]*offline_consultation_attachment/i);
    expect(finalSql).toMatch(/revoke all on function public\.reserve_offline_consultation_attachment/i);
    expect(finalSql).toMatch(/grant execute on function public\.finalize_offline_consultation_attachment/i);
  });

  it.skipIf(!hasPostgres && !requiresPostgres)(
    'executes duplicate, reparent, dispensary, eligibility, and upload races in PostgreSQL',
    async () => {
      if (!hasPostgres) {
        throw new Error('REQUIRE_POSTGRES_TEST=1 requires initdb, pg_ctl, and psql');
      }
      if (!finalMigrationPath) {
        throw new Error('Final offline consultation migration is missing');
      }

      const root = mkdtempSync(join(tmpdir(), 'offline-final-review-'));
      const data = join(root, 'data');
      const bootstrap = join(root, 'bootstrap.sql');
      const createWinner = join(root, 'create-winner.sql');
      const createLoser = join(root, 'create-loser.sql');
      const verifyCreate = join(root, 'verify-create.sql');
      const assertions = join(root, 'assertions.sql');
      const finalizeRaceSetup = join(root, 'finalize-race-setup.sql');
      const finalizeRace = join(root, 'finalize-race.sql');
      const approvalRace = join(root, 'approval-race.sql');
      const verifyFinalizeRace = join(root, 'verify-finalize-race.sql');
      const port = String(58000 + (process.pid % 1000));
      const run = (binary: string, args: string[]) =>
        execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
      const control = (args: string[]) => execFileSync(pgCtl, args, { stdio: 'ignore' });
      const runSql = (path: string) => run(psqlBinary, [
        '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);
      const waitForProcess = (process: ReturnType<typeof spawn>) =>
        new Promise<void>((resolvePromise, rejectPromise) => {
          process.once('error', rejectPromise);
          process.once('exit', (code) => {
            if (code === 0) resolvePromise();
            else rejectPromise(new Error(`PostgreSQL race session exited with ${code}`));
          });
        });

      try {
        run(initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        control([
          '-D', data,
          '-l', join(root, 'postgres.log'),
          '-o', `-h 127.0.0.1 -p ${port}`,
          '-w', 'start',
        ]);

        writeFileSync(bootstrap, `
create schema auth;
create schema storage;
create schema private;
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public, storage, private, auth to authenticated;

create table auth.users (id uuid primary key);
create table public.user_roles (user_id uuid not null, role text not null);
create table public.profiles (id uuid primary key, full_name text);
create table public.patients (id uuid primary key);
create table public.doctors (
  id uuid primary key,
  user_id uuid,
  name text not null,
  status text not null,
  on_duty boolean not null,
  avatar_url text
);
create table public.diagnoses (id uuid primary key);
create table public.queue_entries (
  id uuid primary key,
  patient_id uuid not null,
  clinic_status text not null,
  visit_purpose text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid not null,
  case_note text not null default '',
  diagnosis_id uuid,
  diagnosis_text text not null default '',
  dispense_note text not null default '',
  status text not null default 'in_progress',
  entry_source text not null default 'live',
  entered_by uuid,
  original_consulted_at timestamptz,
  approval_status text not null default 'not_required',
  approved_by uuid,
  approved_at timestamptz,
  returned_by uuid,
  returned_at timestamptz,
  return_reason text,
  approval_revision integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.consultation_approval_audit (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null,
  action text not null,
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  reason text,
  snapshot jsonb not null default '{}'::jsonb
);
create table public.consultation_items (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null,
  item_id uuid,
  item_name text not null default 'Medicine',
  quantity numeric not null default 1,
  price numeric not null default 10,
  price_tier text,
  indication text,
  dosage text,
  dosage_qty numeric,
  dosage_unit text,
  frequency text,
  instruction text,
  duration text,
  precaution text,
  dispensed_qty numeric,
  partial_reason text,
  unit_cost numeric not null default 1,
  service_id uuid,
  package_id uuid,
  billing_adjustment_kind text,
  clinic_charge_type_id uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  is_partial boolean generated always as (
    dispensed_qty is not null and dispensed_qty < quantity
  ) stored
);
create table public.vital_signs (id uuid primary key, queue_entry_id uuid);
create table public.consultation_attachments (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null,
  file_path text not null,
  file_name text not null,
  content_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  remark text
);
create table public.consultation_documents (id uuid primary key, consultation_id uuid not null);
create table public.clinic_appointments (
  id uuid primary key,
  patient_id uuid not null,
  doctor_id uuid,
  appointment_date date not null,
  appointment_time time not null
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null unique,
  owner_id text
);
alter table storage.objects enable row level security;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to authenticated;
create or replace function public.is_ops_or_admin(p_user_id uuid)
returns boolean language sql stable as $$
  select p_user_id in (
    '10000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid
  )
$$;
create or replace function public.can_edit_dispensary_prices(p_user_id uuid)
returns boolean language sql stable as $$
  select p_user_id = '10000000-0000-4000-8000-000000000001'::uuid
$$;
create or replace function public.is_current_user_consultation_doctor(uuid)
returns boolean language sql stable as $$ select false $$;
create or replace function public.open_offline_consultation_write_guard(uuid, uuid)
returns void language plpgsql as $$ begin return; end $$;
create or replace function public.close_offline_consultation_write_guard(uuid, uuid)
returns void language plpgsql as $$ begin return; end $$;

grant all on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005');
insert into public.user_roles(user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'ops_staff'),
  ('10000000-0000-4000-8000-000000000002', 'ops_staff'),
  ('10000000-0000-4000-8000-000000000003', 'resident_doctor'),
  ('10000000-0000-4000-8000-000000000004', 'locum'),
  ('10000000-0000-4000-8000-000000000005', 'resident_doctor');
insert into public.profiles(id, full_name) select id, 'Test User' from auth.users;
insert into public.doctors(id, user_id, name, status, on_duty) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Off-duty Resident', 'active', false),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'On-duty Locum', 'active', true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'Inactive Resident', 'inactive', true);
insert into public.patients(id) values ('30000000-0000-4000-8000-000000000001');
insert into public.queue_entries(id, patient_id, clinic_status, visit_purpose, created_at)
select ('40000000-0000-4000-8000-' || lpad(sequence_number::text, 12, '0'))::uuid,
       '30000000-0000-4000-8000-000000000001',
       'with_doctor',
       'consultation',
       now()
from generate_series(1, 8) as sequence_number;
`, 'utf8');

        writeFileSync(createWinner, `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.save_offline_consultation(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  now(),
  'winner note',
  null,
  'winner diagnosis',
  '',
  null
);
select pg_sleep(2);
commit;
`, 'utf8');
        writeFileSync(createLoser, `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.save_offline_consultation(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  now(),
  'loser overwrite',
  null,
  'loser diagnosis',
  '',
  null
);
commit;
`, 'utf8');
        writeFileSync(verifyCreate, `
do $$
begin
  if (select count(*) from public.consultations where queue_entry_id = '40000000-0000-4000-8000-000000000001' and deleted_at is null) <> 1 then
    raise exception 'CREATE_COUNT_MISMATCH';
  end if;
  if (select case_note from public.consultations where queue_entry_id = '40000000-0000-4000-8000-000000000001' and deleted_at is null) <> 'winner note' then
    raise exception 'CREATE_LOSER_OVERWROTE_WINNER';
  end if;
end $$;
`, 'utf8');

        writeFileSync(assertions, `
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
begin
  if (select count(*) from public.list_eligible_offline_consultation_doctors()) <> 1 then
    raise exception 'OFF_DUTY_ELIGIBILITY_COUNT_MISMATCH';
  end if;
  if not exists (
    select 1 from public.list_eligible_offline_consultation_doctors()
    where id = '20000000-0000-4000-8000-000000000001' and not on_duty
  ) then
    raise exception 'ACTIVE_OFF_DUTY_DOCTOR_MISSING';
  end if;
end $$;
reset role;

insert into public.consultations(
  id, queue_entry_id, patient_id, doctor_id
) values (
  '50000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);
do $$
begin
  begin
    insert into public.consultations(
      id, queue_entry_id, patient_id, doctor_id
    ) values (
      '50000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    raise exception 'SECOND_ACTIVE_CONSULTATION_INSERTED';
  exception when unique_violation then null;
  end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare
  v_source public.consultations%rowtype;
  v_destination_id uuid;
  v_reservation_id uuid;
  v_path text;
begin
  select * into v_source from public.save_offline_consultation(
    '40000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    now(), 'approved source', null, '', '', null
  );
  select id into v_destination_id
  from public.consultations
  where queue_entry_id = '40000000-0000-4000-8000-000000000001'
    and deleted_at is null;

  insert into public.consultation_items(id, consultation_id, item_name, quantity, price)
  values ('60000000-0000-4000-8000-000000000001', v_source.id, 'Medicine', 2, 10);
  insert into public.vital_signs(id, queue_entry_id)
  values ('60000000-0000-4000-8000-000000000002', v_source.queue_entry_id);
  insert into public.consultation_documents(id, consultation_id)
  values ('60000000-0000-4000-8000-000000000003', v_source.id);
  insert into public.clinic_appointments(
    id, patient_id, doctor_id, appointment_date, appointment_time, source_consultation_id
  ) values (
    '60000000-0000-4000-8000-000000000004',
    v_source.patient_id,
    v_source.doctor_id,
    current_date + 1,
    '09:00',
    v_source.id
  );

  select reservation_id, file_path
    into v_reservation_id, v_path
  from public.reserve_offline_consultation_attachment(
    v_source.id, 'source.pdf', 'application/pdf', 100, 'source attachment'
  );
  insert into storage.objects(bucket_id, name, owner_id)
  values ('visit-attachment', v_path, auth.uid()::text);
  perform public.finalize_offline_consultation_attachment(v_reservation_id);

  update public.consultations
  set approval_status = 'approved'
  where id = v_source.id;

  begin
    update public.consultation_items
    set consultation_id = v_destination_id
    where id = '60000000-0000-4000-8000-000000000001';
    raise exception 'APPROVED_ITEM_REPARENTED';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.vital_signs
    set queue_entry_id = '40000000-0000-4000-8000-000000000001'
    where id = '60000000-0000-4000-8000-000000000002';
    raise exception 'APPROVED_VITAL_REPARENTED';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.consultation_documents
    set consultation_id = v_destination_id
    where id = '60000000-0000-4000-8000-000000000003';
    raise exception 'APPROVED_DOCUMENT_REPARENTED';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.clinic_appointments
    set source_consultation_id = v_destination_id
    where id = '60000000-0000-4000-8000-000000000004';
    raise exception 'APPROVED_FOLLOWUP_REPARENTED';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.consultation_attachments
    set consultation_id = v_destination_id
    where consultation_id = v_source.id;
    raise exception 'APPROVED_ATTACHMENT_REPARENTED';
  exception when sqlstate '42501' then null;
  end;

  perform public.update_consultation_item_dispensary(
    '60000000-0000-4000-8000-000000000001',
    v_source.id,
    '{"dispensed_qty":1,"partial_reason":"out_of_stock"}'::jsonb
  );
  if not exists (
    select 1 from public.consultation_items
    where id = '60000000-0000-4000-8000-000000000001'
      and dispensed_qty = 1
      and partial_reason = 'out_of_stock'
  ) then
    raise exception 'APPROVED_DISPENSING_UPDATE_FAILED';
  end if;

  begin
    perform public.update_consultation_item_dispensary(
      '60000000-0000-4000-8000-000000000001',
      v_source.id,
      '{"price":99}'::jsonb
    );
    raise exception 'APPROVED_PRICE_CHANGED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.update_consultation_item_dispensary(
      '60000000-0000-4000-8000-000000000001',
      v_source.id,
      '{"indication":"changed"}'::jsonb
    );
    raise exception 'APPROVED_CLINICAL_ITEM_CHANGED';
  exception when sqlstate '42501' then null;
  end;
end $$;

do $$
declare
  v_consultation public.consultations%rowtype;
  v_reservation_id uuid;
  v_path text;
  v_status text;
  v_count integer;
begin
  select * into v_consultation from public.save_offline_consultation(
    '40000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    now(), 'upload pending', null, '', '', null
  );
  select reservation_id, file_path into v_reservation_id, v_path
  from public.reserve_offline_consultation_attachment(
    v_consultation.id, 'pending.pdf', 'application/pdf', 100, null
  );
  insert into storage.objects(bucket_id, name, owner_id)
  values ('visit-attachment', v_path, auth.uid()::text);

  select count(*) into v_count from storage.objects where name = v_path;
  if v_count <> 1 then raise exception 'RESERVATION_OWNER_CANNOT_READ_UPLOAD'; end if;

  begin
    update public.consultations set approval_status = 'approved' where id = v_consultation.id;
    raise exception 'APPROVAL_IGNORED_ACTIVE_UPLOAD';
  exception when sqlstate '55000' then
    if sqlerrm <> 'offline_consultation_attachment_upload_pending' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
  select count(*) into v_count from storage.objects where name = v_path;
  if v_count <> 0 then raise exception 'OTHER_OPS_READ_UNFINALIZED_UPLOAD'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

  perform public.finalize_offline_consultation_attachment(v_reservation_id);
  update public.consultations set approval_status = 'approved' where id = v_consultation.id;
  if not exists (
    select 1 from public.consultation_attachments
    where consultation_id = v_consultation.id and file_path = v_path
  ) then
    raise exception 'FINALIZED_METADATA_MISSING';
  end if;

  select * into v_consultation from public.save_offline_consultation(
    '40000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000001',
    now(), 'cleanup required', null, '', '', null
  );
  select reservation_id, file_path into v_reservation_id, v_path
  from public.reserve_offline_consultation_attachment(
    v_consultation.id, 'orphan.pdf', 'application/pdf', 100, null
  );
  insert into storage.objects(bucket_id, name, owner_id)
  values ('visit-attachment', v_path, auth.uid()::text);
  select status into v_status
  from public.cancel_offline_consultation_attachment_upload(v_reservation_id);
  if v_status <> 'cleanup_required' then raise exception 'ORPHAN_NOT_MARKED_FOR_CLEANUP'; end if;
  select count(*) into v_count from storage.objects where name = v_path;
  if v_count <> 0 then raise exception 'CLEANUP_OBJECT_REMAINS_READABLE'; end if;
  update public.consultations set approval_status = 'approved' where id = v_consultation.id;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1
    from private.offline_consultation_attachment_reservations as reservation
    join storage.objects as object
      on object.bucket_id = 'visit-attachment'
     and object.name = reservation.file_path
    where reservation.status = 'cleanup_required'
  ) then
    raise exception 'FAILED_UPLOAD_NOT_COLLECTABLE';
  end if;
end $$;
`, 'utf8');

        writeFileSync(finalizeRaceSetup, `
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare
  v_consultation public.consultations%rowtype;
  v_path text;
begin
  select * into v_consultation from public.save_offline_consultation(
    '40000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000001',
    now(), 'finalize race', null, '', '', null
  );
  select file_path into v_path
  from public.reserve_offline_consultation_attachment(
    v_consultation.id, 'race.pdf', 'application/pdf', 100, null
  );
  insert into storage.objects(bucket_id, name, owner_id)
  values ('visit-attachment', v_path, auth.uid()::text);
end $$;
`, 'utf8');
        writeFileSync(finalizeRace, `
begin;
select set_config(
  'app.test.offline_attachment_reservation_id',
  (
    select reservation.id::text
    from private.offline_consultation_attachment_reservations as reservation
    join public.consultations as consultation on consultation.id = reservation.consultation_id
    where consultation.queue_entry_id = '40000000-0000-4000-8000-000000000007'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.finalize_offline_consultation_attachment(
  current_setting('app.test.offline_attachment_reservation_id')::uuid
);
select pg_sleep(2);
commit;
`, 'utf8');
        writeFileSync(approvalRace, `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
update public.consultations
set approval_status = 'approved'
where queue_entry_id = '40000000-0000-4000-8000-000000000007';
commit;
`, 'utf8');
        writeFileSync(verifyFinalizeRace, `
do $$
declare v_consultation_id uuid;
begin
  select id into v_consultation_id
  from public.consultations
  where queue_entry_id = '40000000-0000-4000-8000-000000000007';
  if (select approval_status from public.consultations where id = v_consultation_id) <> 'approved' then
    raise exception 'FINALIZE_RACE_NOT_APPROVED';
  end if;
  if (select count(*) from public.consultation_attachments where consultation_id = v_consultation_id) <> 1 then
    raise exception 'FINALIZE_RACE_LEFT_UNTRACKED_OBJECT';
  end if;
end $$;
`, 'utf8');

        runSql(bootstrap);
        runSql(dispensaryMigrationPath);
        runSql(hardeningMigrationPath);
        runSql(attachmentDeleteMigrationPath);
        runSql(finalMigrationPath);

        const winner = spawn(psqlBinary, [
          '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
          '-U', 'postgres', '-d', 'postgres', '-f', createWinner,
        ], { stdio: 'ignore' });
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
        expect(() => runSql(createLoser)).toThrow(/duplicate_offline_consultation/);
        await waitForProcess(winner);
        runSql(verifyCreate);

        runSql(assertions);
        runSql(finalizeRaceSetup);
        const finalizer = spawn(psqlBinary, [
          '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
          '-U', 'postgres', '-d', 'postgres', '-f', finalizeRace,
        ], { stdio: 'ignore' });
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
        runSql(approvalRace);
        await waitForProcess(finalizer);
        runSql(verifyFinalizeRace);
      } finally {
        try {
          control(['-D', data, '-m', 'fast', '-w', 'stop']);
        } catch {
          // Startup and migration errors are surfaced by the commands above.
        }
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
