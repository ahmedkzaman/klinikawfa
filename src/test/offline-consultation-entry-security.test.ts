import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260802233000_harden_offline_consultation_entry.sql',
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const postgresBin = process.env.POSTGRES_BIN
  ?? 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const initdb = join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
const pgCtl = join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const psqlBinary = join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql');
const hasPostgres = [initdb, pgCtl, psqlBinary].every(existsSync);

describe('offline consultation entry security boundary', () => {
  it('adds bounded discovery and authoritative mutation RPCs', () => {
    expect(sql).toContain('list_offline_consultation_entry_visits');
    expect(sql).toContain('list_eligible_offline_consultation_doctors');
    expect(sql).toContain('get_offline_consultation_entry_state');
    expect(sql).toContain('assert_offline_consultation_editable');
    expect(sql).toContain('proceed_offline_consultation_to_dispensary');
  });

  it('guards every Task 3 related-write boundary', () => {
    for (const table of [
      'consultation_items',
      'vital_signs',
      'consultation_attachments',
      'consultation_documents',
      'clinic_appointments',
    ]) {
      expect(sql).toMatch(new RegExp(`ON public\\.${table}`, 'i'));
    }
    expect(sql).toContain('offline_consultation_not_editable');
  });

  it.skipIf(!hasPostgres)(
    'executes discovery, doctor eligibility, related-write locks, and workflow guards',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'offline-entry-hardening-'));
      const data = join(root, 'data');
      const bootstrap = join(root, 'bootstrap.sql');
      const assertions = join(root, 'assertions.sql');
      const port = String(57000 + (process.pid % 1000));
      const run = (binary: string, args: string[]) =>
        execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
      const control = (args: string[]) =>
        execFileSync(pgCtl, args, { stdio: 'ignore' });
      const runSql = (path: string) => run(psqlBinary, [
        '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);

      try {
        run(initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        control(['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
        writeFileSync(bootstrap, `
create schema auth;
create role anon nologin;
create role authenticated nologin;
create table auth.users (id uuid primary key);
create table public.user_roles (user_id uuid not null, role text not null);
create table public.profiles (id uuid primary key, full_name text);
create table public.patients (id uuid primary key);
create table public.doctors (id uuid primary key, user_id uuid, name text not null, status text not null, on_duty boolean not null, avatar_url text);
create table public.queue_entries (id uuid primary key, patient_id uuid not null, clinic_status text not null, visit_purpose text not null, created_at timestamptz not null, updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.consultations (id uuid primary key, queue_entry_id uuid not null, patient_id uuid not null, doctor_id uuid not null, case_note text not null default '', diagnosis_id uuid, diagnosis_text text not null default '', dispense_note text not null default '', status text not null default 'in_progress', entry_source text not null default 'live', entered_by uuid, original_consulted_at timestamptz, approval_status text not null default 'not_required', approved_by uuid, approved_at timestamptz, returned_by uuid, returned_at timestamptz, return_reason text, approval_revision integer not null default 0, created_at timestamptz not null default now(), deleted_at timestamptz);
create table public.consultation_items (id uuid primary key, consultation_id uuid not null);
create table public.vital_signs (id uuid primary key, queue_entry_id uuid);
create table public.consultation_attachments (id uuid primary key, consultation_id uuid not null);
create table public.consultation_documents (id uuid primary key, consultation_id uuid not null);
create table public.clinic_appointments (id uuid primary key, patient_id uuid not null, doctor_id uuid, appointment_date date not null, appointment_time time not null);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant all on all tables in schema public to authenticated;
insert into auth.users values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002'), ('10000000-0000-4000-8000-000000000003'), ('10000000-0000-4000-8000-000000000004');
insert into public.user_roles values
 ('10000000-0000-4000-8000-000000000001', 'ops_staff'),
 ('10000000-0000-4000-8000-000000000002', 'resident_doctor'),
 ('10000000-0000-4000-8000-000000000003', 'locum'),
 ('10000000-0000-4000-8000-000000000004', 'resident_doctor');
insert into public.profiles values ('10000000-0000-4000-8000-000000000001', 'Original Operations Staff'), ('10000000-0000-4000-8000-000000000002', 'Dr Reviewer');
insert into public.patients values ('20000000-0000-4000-8000-000000000001');
insert into public.doctors values
 ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Eligible', 'active', true, null),
 ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Locum', 'active', true, null),
 ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'Inactive', 'inactive', true, null);
insert into public.queue_entries values
 ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'with_doctor', 'consultation', now(), now(), null),
 ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'completed', 'consultation', now(), now(), null);
`, 'utf8');
        writeFileSync(assertions, `
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.list_offline_consultation_entry_visits(now() - interval '1 day', now() + interval '1 day');
  if v_count <> 1 then raise exception 'VISIT_FILTER_FAILED'; end if;
  select count(*) into v_count from public.list_eligible_offline_consultation_doctors();
  if v_count <> 1 then raise exception 'DOCTOR_FILTER_FAILED'; end if;
end $$;
insert into public.consultations(id, queue_entry_id, patient_id, doctor_id, entry_source, entered_by, original_consulted_at, approval_status)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'offline_transcription', '10000000-0000-4000-8000-000000000001', now(), 'pending');
insert into public.consultation_items values ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001');
insert into public.vital_signs values ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001');
insert into public.consultation_attachments values ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001');
insert into public.consultation_documents values ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001');
insert into public.clinic_appointments(id, patient_id, doctor_id, appointment_date, appointment_time, source_consultation_id) values ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', current_date + 1, '09:00', '50000000-0000-4000-8000-000000000001');
reset role;
update public.consultations set approval_status = 'approved' where id = '50000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
begin
  begin insert into public.consultation_items values ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001'); raise exception 'ITEM_WRITE_SUCCEEDED'; exception when sqlstate '42501' then null; end;
  begin insert into public.vital_signs values ('70000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001'); raise exception 'VITAL_WRITE_SUCCEEDED'; exception when sqlstate '42501' then null; end;
  begin insert into public.consultation_attachments values ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001'); raise exception 'ATTACHMENT_WRITE_SUCCEEDED'; exception when sqlstate '42501' then null; end;
  begin insert into public.consultation_documents values ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001'); raise exception 'DOCUMENT_WRITE_SUCCEEDED'; exception when sqlstate '42501' then null; end;
  begin insert into public.clinic_appointments(id, patient_id, appointment_date, appointment_time, source_consultation_id) values ('70000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', current_date + 1, '10:00', '50000000-0000-4000-8000-000000000001'); raise exception 'FOLLOWUP_WRITE_SUCCEEDED'; exception when sqlstate '42501' then null; end;
end $$;
reset role;
update public.consultations set approval_status = 'pending', status = 'completed' where id = '50000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$ begin
  begin perform public.proceed_offline_consultation_to_dispensary('50000000-0000-4000-8000-000000000001', 0); raise exception 'COMPLETED_PROCEED_SUCCEEDED'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
update public.consultations set status = 'in_progress' where id = '50000000-0000-4000-8000-000000000001';
update public.queue_entries set clinic_status = 'completed' where id = '40000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$ begin
  begin perform public.proceed_offline_consultation_to_dispensary('50000000-0000-4000-8000-000000000001', 0); raise exception 'COMPLETED_QUEUE_PROCEED_SUCCEEDED'; exception when sqlstate '22023' then null; end;
end $$;
`, 'utf8');

        runSql(bootstrap);
        runSql(migrationPath);
        runSql(assertions);
      } finally {
        try {
          control(['-D', data, '-m', 'fast', '-w', 'stop']);
        } catch {
          // Server startup failures are surfaced by the test command above.
        }
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
