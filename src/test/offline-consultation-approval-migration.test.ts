import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260802190000_add_offline_consultation_approval.sql',
);
const securityGatePath = resolve(process.cwd(), '.github/workflows/security-gate.yml');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const securityGate = existsSync(securityGatePath) ? readFileSync(securityGatePath, 'utf8') : '';
type PostgresToolName = 'initdb' | 'pgCtl' | 'psql';
type PostgresTools = Record<PostgresToolName, string>;

const windowsBundledPostgresBin = 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const executableNames: Record<PostgresToolName, string> = {
  initdb: 'initdb',
  pgCtl: 'pg_ctl',
  psql: 'psql',
};

function findPostgresTool(tool: PostgresToolName): string {
  const configuredBin = process.env.POSTGRES_BIN;
  const candidateDirectories = configuredBin
    ? [configuredBin]
    : [
        ...(process.platform === 'win32' ? [windowsBundledPostgresBin] : []),
        ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
      ];
  const candidateNames = process.platform === 'win32'
    ? [`${executableNames[tool]}.exe`, executableNames[tool]]
    : [executableNames[tool]];

  for (const directory of candidateDirectories) {
    for (const candidateName of candidateNames) {
      const candidate = join(directory, candidateName);
      if (existsSync(candidate)) return candidate;
    }
  }

  return '';
}

function requirePostgresRuntime(required: boolean, tools: PostgresTools) {
  if (required && Object.values(tools).some((tool) => !tool)) {
    throw new Error('REQUIRE_POSTGRES_TEST=1 requires initdb, pg_ctl, and psql');
  }
}

const postgresTools: PostgresTools = {
  initdb: findPostgresTool('initdb'),
  pgCtl: findPostgresTool('pgCtl'),
  psql: findPostgresTool('psql'),
};
const hasPostgresRuntime = Object.values(postgresTools).every(Boolean);
const requiresPostgresTest = process.env.REQUIRE_POSTGRES_TEST === '1' || process.env.CI === 'true';

function runPostgresTool(tool: string, args: string[]) {
  return execFileSync(tool, args, { encoding: 'utf8', stdio: 'pipe' });
}

function runPostgresControl(args: string[]) {
  execFileSync(postgresTools.pgCtl, args, { stdio: 'ignore' });
}

describe('offline consultation approval migration', () => {
  it('fails closed when a required PostgreSQL runtime is missing', () => {
    const missingTools: PostgresTools = { initdb: '', pgCtl: '', psql: '' };

    expect(() => requirePostgresRuntime(true, missingTools)).toThrow(
      'REQUIRE_POSTGRES_TEST=1 requires initdb, pg_ctl, and psql',
    );
  });

  it('provisions and requires PostgreSQL for the Security Gate test run', () => {
    expect(securityGate).toMatch(/name: Install PostgreSQL runtime[\s\S]*sudo apt-get install -y postgresql/i);
    expect(securityGate).toMatch(/POSTGRES_BIN=\$\(pg_config --bindir\)/i);
    expect(securityGate).toMatch(/name: Unit tests[\s\S]*REQUIRE_POSTGRES_TEST:\s*["']?1["']?/i);
  });

  it('creates the server-controlled approval state and immutable audit log', () => {
    expect(sql).toMatch(/add column if not exists entry_source text not null default 'live'/i);
    expect(sql).toMatch(/add column if not exists entered_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists original_consulted_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists approval_status text not null default 'not_required'/i);
    expect(sql).toMatch(/add column if not exists approved_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists approved_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists returned_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists returned_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists return_reason text/i);
    expect(sql).toMatch(/add column if not exists approval_revision integer not null default 0/i);
    expect(sql).toMatch(/check \(entry_source in \('live', 'offline_transcription'\)\)/i);
    expect(sql).toMatch(/check \(approval_status in \('not_required', 'pending', 'returned', 'approved'\)\)/i);
    expect(sql).toMatch(/create table if not exists public\.consultation_approval_audit/i);
    expect(sql).toMatch(/snapshot jsonb not null default '\{\}'::jsonb/i);
    expect(sql).toMatch(/jsonb_typeof\(snapshot\) = 'object'/i);
    expect(sql).toMatch(/pg_column_size\(snapshot\) <= 16384/i);
    expect(sql).toMatch(/alter table public\.consultation_approval_audit enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.consultation_approval_audit from public, anon, authenticated/i);
    expect(sql).toMatch(/create policy consultation_approval_audit_read/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on table public\.consultation_approval_audit to authenticated/i);
    expect(sql).toMatch(/create or replace function public\.guard_consultation_approval_audit_immutable/i);
    expect(sql).toMatch(/consultation_approval_audit_immutable/i);
    expect(sql).toMatch(/create trigger guard_consultation_approval_audit_immutable[\s\S]*before update or delete/i);
  });

  it('provides only hardened authenticated approval RPCs', () => {
    for (const signature of [
      'save_offline_consultation',
      'review_offline_consultation',
      'get_offline_consultation_audit',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}[\\s\\S]*from public[\\s\\S]*from anon[\\s\\S]*grant execute on function public\\.${signature}[\\s\\S]*to authenticated`,
          'i',
        ),
      );
    }

    expect(sql).toMatch(/create or replace function public\.save_offline_consultation\([\s\S]*p_queue_entry_id uuid[\s\S]*p_doctor_id uuid[\s\S]*p_original_consulted_at timestamptz[\s\S]*p_case_note text[\s\S]*p_diagnosis_id uuid[\s\S]*p_diagnosis_text text[\s\S]*p_dispense_note text[\s\S]*p_expected_revision integer[\s\S]*returns public\.consultations/i);
    expect(sql).toMatch(/create or replace function public\.review_offline_consultation\([\s\S]*p_consultation_id uuid[\s\S]*p_action text[\s\S]*p_reason text default null[\s\S]*p_expected_revision integer default null[\s\S]*returns public\.consultations/i);
    expect(sql).toMatch(/create or replace function public\.get_offline_consultation_audit\([\s\S]*returns table\(\s*id uuid,\s*action text,\s*actor_id uuid,\s*actor_name text,\s*created_at timestamptz,\s*reason text\s*\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
  });

  it('enforces the offline entry state machine and protected provenance', () => {
    const save = sql.match(
      /create or replace function public\.save_offline_consultation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(save).toMatch(/min\(role::text\) = 'ops_staff'/i);
    expect(save).toMatch(/v_actor_id uuid := auth\.uid\(\)/i);
    expect(save).toMatch(/from public\.queue_entries[\s\S]*for update/i);
    expect(save).toMatch(/from public\.doctors[\s\S]*on_duty/i);
    expect(save).toMatch(/role::text in \('resident_doctor', 'doctor_admin'\)/i);
    expect(save).not.toMatch(/not public\.is_clinical\(v_doctor\.user_id\)/i);
    expect(save).toMatch(/from public\.consultations[\s\S]*for update/i);
    expect(save).toMatch(/duplicate_offline_consultation/i);
    expect(save).toMatch(/entry_source,\s*entered_by,\s*original_consulted_at,\s*approval_status/i);
    expect(save).toMatch(/'offline_transcription',\s*v_actor_id,\s*p_original_consulted_at,\s*'pending'/i);
    expect(save).toMatch(/approval_revision = approval_revision \+ 1/i);
    expect(save).toMatch(/v_consultation\.approval_status not in \('pending', 'returned'\)/i);
    expect(save).toMatch(/stale_offline_consultation/i);
    expect(save).toMatch(/doctor_reassigned/i);
    expect(save).toMatch(/returned_by = null[\s\S]*returned_at = null[\s\S]*return_reason = null/i);
    expect(save).toMatch(/insert into public\.consultation_approval_audit/i);

    expect(sql).toMatch(/create or replace function public\.guard_offline_consultation_provenance/i);
    expect(sql).toMatch(/offline_consultation_provenance_managed_by_rpc/i);
    expect(sql).toMatch(/create trigger guard_offline_consultation_provenance/i);
    expect(sql).toMatch(/if tg_op = 'insert' then[\s\S]*new\.entry_source = 'offline_transcription'[\s\S]*else[\s\S]*new\.entry_source is distinct from old\.entry_source/i);
    expect(sql).toMatch(/create policy consultations_offline_direct_insert_denied/i);
    expect(sql).toMatch(/create policy consultations_offline_direct_update_denied/i);
  });

  it('allows only the consulting doctor or doctor administrator to review pending entries', () => {
    const review = sql.match(
      /create or replace function public\.review_offline_consultation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(review).toMatch(/from public\.consultations[\s\S]*for update/i);
    expect(review).toMatch(/v_consultation\.approval_status <> 'pending'/i);
    expect(review).toMatch(/role::text = 'doctor_admin'/i);
    expect(review).toMatch(/is_current_offline_consultation_doctor\(\s*v_consultation\.id,\s*v_actor_id\s*\)/i);
    expect(review).toMatch(/v_is_ops_staff/i);
    expect(review).toMatch(/not_authorized_offline_consultation_review/i);
    expect(review).toMatch(/v_action is null or v_action not in \('approve', 'return'\)/i);
    expect(review).toMatch(/p_expected_revision is null/i);
    expect(review).toMatch(/return_reason_required/i);
    expect(review).toMatch(/approval_status = 'approved'[\s\S]*approved_by = v_actor_id[\s\S]*approved_at = now\(\)/i);
    expect(review).toMatch(/approval_status = 'returned'[\s\S]*returned_by = v_actor_id[\s\S]*returned_at = now\(\)/i);
    expect(review).toMatch(/approval_revision = approval_revision \+ 1/i);
    expect(review).toMatch(/insert into public\.consultation_approval_audit/i);
    expect(review).not.toMatch(/update public\.consultations[\s\S]*doctor_id\s*=/i);
    expect(sql).toMatch(/create or replace function public\.is_current_offline_consultation_doctor/i);
    expect(sql).toMatch(/consultation_approval_audit_read[\s\S]*is_current_offline_consultation_doctor\(\s*consultation\.id,\s*auth\.uid\(\)\s*\)/i);
    expect(sql).toMatch(/create or replace function public\.get_offline_consultation_audit[\s\S]*is_current_offline_consultation_doctor\(\s*v_consultation\.id,\s*v_actor_id\s*\)/i);
  });

  it('keeps checkout independent and verifies the deployed security contract', () => {
    expect(sql).not.toMatch(/create or replace function public\.(checkout_visit|record_payment_and_complete_visit)/i);
    expect(sql).toMatch(/consultation_approval_audit_consultation_created_idx/i);
    expect(sql).toMatch(/consultations_offline_approval_worklist_idx/i);
    expect(sql).toMatch(/offline consultation postflight failed/i);
    expect(sql).toMatch(/has_function_privilege\('anon'/i);
    expect(sql).toMatch(/has_function_privilege\('anon'/i);
    expect(sql).toMatch(/has_table_privilege\('authenticated'/i);
    expect(sql).toMatch(/locum/i);
  });

  it.skipIf(!hasPostgresRuntime && !requiresPostgresTest)(
    'executes the migration state machine against disposable PostgreSQL',
    () => {
      requirePostgresRuntime(requiresPostgresTest, postgresTools);
      const root = mkdtempSync(join(tmpdir(), 'offline-consultation-'));
      const dataDirectory = join(root, 'data');
      const port = String(56000 + (process.pid % 1000));
      const bootstrapPath = join(root, 'bootstrap.sql');
      const stateMachinePath = join(root, 'state-machine.sql');

      const psql = (path: string) => runPostgresTool(postgresTools.psql, [
        '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);

      try {
        runPostgresTool(postgresTools.initdb, [
          '-D', dataDirectory, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8',
        ]);
        runPostgresControl([
          '-D', dataDirectory, '-l', join(root, 'postgres.log'),
          '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start',
        ]);

        writeFileSync(bootstrapPath, `
create schema auth;
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create table auth.users (id uuid primary key);
create table public.user_roles (user_id uuid not null references auth.users(id), role text not null);
create table public.profiles (id uuid primary key references auth.users(id), full_name text);
create table public.patients (id uuid primary key, name text not null);
create table public.doctors (id uuid primary key, user_id uuid references auth.users(id), name text not null, on_duty boolean not null default false);
create table public.diagnoses (id uuid primary key);
create table public.queue_entries (id uuid primary key, patient_id uuid not null references public.patients(id), deleted_at timestamptz);
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid references public.doctors(id),
  case_note text not null default '', diagnosis_id uuid references public.diagnoses(id),
  diagnosis_text text not null default '', dispense_note text not null default '',
  status text not null default 'in_progress', deleted_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function public.is_admin(uuid) returns boolean language sql stable as $$ select false $$;
create or replace function public.has_strict_role(uuid, text) returns boolean language sql stable as $$ select false $$;
create or replace function public.is_clinical(p_user_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role in ('resident_doctor', 'doctor_admin', 'admin', 'special_admin', 'locum'))
$$;
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'), ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'), ('10000000-0000-4000-8000-000000000006');
insert into public.user_roles(user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'ops_staff'),
  ('10000000-0000-4000-8000-000000000002', 'resident_doctor'),
  ('10000000-0000-4000-8000-000000000003', 'doctor_admin'),
  ('10000000-0000-4000-8000-000000000004', 'locum'),
  ('10000000-0000-4000-8000-000000000005', 'ops_staff'),
  ('10000000-0000-4000-8000-000000000006', 'admin');
insert into public.profiles(id, full_name) select id, 'Test user' from auth.users;
insert into public.doctors(id, user_id, name, on_duty) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Resident', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 'General admin', true);
insert into public.patients(id, name) values ('30000000-0000-4000-8000-000000000001', 'Test patient');
insert into public.queue_entries(id, patient_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001');
`, 'utf8');

        writeFileSync(stateMachinePath, `
insert into public.consultations(id, queue_entry_id, patient_id, doctor_id)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare v_consultation public.consultations%rowtype;
begin
  begin
    perform public.save_offline_consultation('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now(), '', null, '', '', 0);
    raise exception 'GENERAL_ADMIN_DOCTOR_ACCEPTED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'offline_consultation_ineligible_doctor' then raise; end if;
  end;
  begin
    perform public.save_offline_consultation('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', now(), '', null, '', '', 1);
    raise exception 'STALE_CREATE_SUCCEEDED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'stale_offline_consultation' then raise; end if;
  end;
  select * into v_consultation from public.save_offline_consultation('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', now(), '', null, '', '', 0);
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  begin
    perform public.review_offline_consultation(v_consultation.id, null, 'reason', 0);
    raise exception 'NULL_ACTION_SUCCEEDED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'offline_consultation_review_action_invalid' then raise; end if;
  end;
  begin
    perform public.review_offline_consultation(v_consultation.id, 'approve', null, null);
    raise exception 'NULL_REVISION_SUCCEEDED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'offline_consultation_expected_revision_required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  begin
    perform public.review_offline_consultation(v_consultation.id, 'approve', null, 0);
    raise exception 'OPS_SELF_APPROVAL_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'not_authorized_offline_consultation_review' then raise; end if;
  end;
end
$$;
reset role;
update public.doctors set user_id = '10000000-0000-4000-8000-000000000005' where id = '20000000-0000-4000-8000-000000000001';
select set_config('app.test.consultation_id', (select id::text from public.consultations where queue_entry_id = '40000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
do $$
declare v_id uuid := current_setting('app.test.consultation_id')::uuid;
begin
  begin
    perform public.review_offline_consultation(v_id, 'approve', null, 0);
    raise exception 'STALE_DOCTOR_LINK_REVIEW_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'not_authorized_offline_consultation_review' then raise; end if;
  end;
  begin
    perform public.get_offline_consultation_audit(v_id);
    raise exception 'STALE_DOCTOR_LINK_AUDIT_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'not_authorized_offline_consultation_audit' then raise; end if;
  end;
end
$$;
reset role;
update public.doctors set user_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
do $$
declare v_id uuid := current_setting('app.test.consultation_id')::uuid;
begin
  begin
    perform public.review_offline_consultation(v_id, 'approve', null, 0);
    raise exception 'LOCUM_REVIEW_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'locum_cannot_review_offline_consultation' then raise; end if;
  end;
end
$$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare v_id uuid := current_setting('app.test.consultation_id')::uuid;
begin
  perform public.review_offline_consultation(v_id, 'return', 'correction needed', 0);
end
$$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare v_result public.consultations%rowtype;
begin
  select * into v_result from public.save_offline_consultation('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', now(), '', null, '', '', 1);
  if v_result.approval_status <> 'pending' or v_result.approval_revision <> 2 then raise exception 'RESUBMISSION_STATE_MISMATCH'; end if;
end
$$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
declare v_result public.consultations%rowtype;
begin
  select * into v_result from public.review_offline_consultation(current_setting('app.test.consultation_id')::uuid, 'approve', null, 2);
  if v_result.approval_status <> 'approved' or v_result.doctor_id <> '20000000-0000-4000-8000-000000000001' then raise exception 'DOCTOR_ADMIN_FALLBACK_FAILED'; end if;
end
$$;
reset role;
do $$
declare v_audit_id uuid := (select id from public.consultation_approval_audit limit 1);
begin
  begin
    update public.consultation_approval_audit set reason = 'tampered' where id = v_audit_id;
    raise exception 'AUDIT_UPDATE_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'consultation_approval_audit_immutable' then raise; end if;
  end;
  begin
    delete from public.consultation_approval_audit where id = v_audit_id;
    raise exception 'AUDIT_DELETE_SUCCEEDED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'consultation_approval_audit_immutable' then raise; end if;
  end;
end
$$;
rollback;
`, 'utf8');

        psql(bootstrapPath);
        psql(migrationPath);
        psql(stateMachinePath);
      } finally {
        try {
          runPostgresControl(['-D', dataDirectory, '-m', 'fast', '-w', 'stop']);
        } catch {
          // The server may not have started far enough to accept a stop command.
        }
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
