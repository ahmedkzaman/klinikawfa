import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260816120000_add_insight_performance_report.sql',
);
const detailMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817120000_complete_insight_performance_details.sql',
);
const roundTwoMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817130000_complete_insight_workspace_security_filters.sql',
);
const roundThreeMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817140000_harden_insight_refresh_and_filtered_semantics.sql',
);
const roundFourMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817150000_enforce_insight_doctor_visibility_and_cohorts.sql',
);
const roundFiveMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817160000_complete_insight_document_rows_and_attendance_roster.sql',
);
const doctorActivityPaymentOnlyMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817170000_exclude_payment_only_doctor_activity.sql',
);
const fixturePath = resolve(process.cwd(), 'supabase/tests/insight_performance.sql');
const postgresBin = process.env.POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const postgresTools = {
  initdb: join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
  pgCtl: join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
  psql: join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql'),
};
const hasPostgresRuntime = Object.values(postgresTools).every(existsSync);

const bootstrapSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users(
  id uuid primary key, aud text, role text, email text,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create type public.app_role as enum (
  'admin', 'staff', 'guest', 'special_admin', 'operations', 'doctor_admin',
  'locum', 'resident_doctor', 'ops_staff', 'website_editor', 'purchaser', 'staff_nurse'
);
create table public.profiles(
  id uuid primary key references auth.users(id), email text not null,
  full_name text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.user_roles(
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
  role public.app_role not null, created_at timestamptz default now()
);
create table public.clinic_role_permissions(
  role public.app_role not null, permission_key text not null, allowed boolean not null default false,
  updated_at timestamptz not null default now(), updated_by uuid,
  primary key(role, permission_key)
);
create table public.clinic_user_permission_overrides(
  user_id uuid not null, permission_key text not null, allowed boolean not null,
  updated_at timestamptz not null default now(), updated_by uuid not null,
  primary key(user_id, permission_key)
);
create function public.has_clinic_permission(_permission_key text, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false else coalesce(
    (select override.allowed from public.clinic_user_permission_overrides as override
      where override.user_id = _user_id and override.permission_key = _permission_key),
    (select permission.allowed from public.user_roles as role_row
      join public.clinic_role_permissions as permission on permission.role = role_row.role
      where role_row.user_id = _user_id and permission.permission_key = _permission_key), false)
  end
$$;
create function public.can_view_insight_workspace(_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id
    and role::text = any(array['special_admin','admin','doctor_admin','resident_doctor','ops_staff','operations']))
    and public.has_clinic_permission('reports.view', _user_id)
$$;
create function public.can_view_management_dashboard(_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select _user_id is not distinct from auth.uid() and exists (
    select 1 from public.user_roles where user_id = _user_id
      and role::text in ('special_admin', 'admin', 'doctor_admin')
  )
$$;
create function public.get_clinic_health_metrics(date, date) returns jsonb
language sql stable as $$ select '{}'::jsonb $$;
create function public.get_financial_control_summary(date, date, date, date, date) returns jsonb
language sql stable as $$ select '{}'::jsonb $$;
create function public.get_financial_control_details(date, date, date, text, text, text, integer, integer) returns jsonb
language sql stable as $$ select '{}'::jsonb $$;
create function public.get_clinical_attendance_heatmap(date, date, uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.can_view_management_dashboard(auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return '{}'::jsonb;
end
$$;
create table public.doctors(
  id uuid primary key, user_id uuid references auth.users(id), name text not null,
  status text not null default 'active', on_duty boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.patients(id uuid primary key, name text not null);
create table public.diagnoses(id uuid primary key, name text not null);
create table public.services(
  id uuid primary key, name text not null, category text, cost numeric not null default 0,
  price_to_patient numeric not null default 0, status text not null default 'active'
);
create table public.inventory_items(id uuid primary key, name text not null, category text);
create table public.packages(id uuid primary key, name text not null);
create table public.saved_rosters(
  id uuid primary key, roster_type text not null, month integer not null, year integer not null,
  roster_data jsonb not null default '{}', staff_list jsonb not null default '[]',
  warnings jsonb not null default '[]', created_by uuid not null,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(roster_type, month, year)
);
create table public.queue_entries(
  id uuid primary key, patient_id uuid not null, assigned_doctor_id uuid,
  clinic_status text not null, queue_number integer, visit_type text not null default 'consultation',
  queue_sequence integer, payment_method text, called_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz default now(),
  deleted_at timestamptz, cancelled_at timestamptz
);
create table public.consultations(
  id uuid primary key, queue_entry_id uuid not null, patient_id uuid not null, doctor_id uuid,
  status text not null default 'in_progress', case_note text not null default '',
  diagnosis_id uuid references public.diagnoses(id), diagnosis_text text not null default '',
  dispense_note text not null default '', entry_source text not null default 'live', returned_at timestamptz,
  deleted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.consultation_items(
  id uuid primary key, consultation_id uuid not null, service_id uuid, item_id uuid, package_id uuid,
  item_name text not null, quantity numeric not null default 1, price numeric not null default 0,
  unit_cost numeric not null default 0, dispensed_qty numeric,
  source_document_id uuid,
  deleted_at timestamptz, created_at timestamptz default now()
);
create table public.payments(
  id uuid primary key, queue_entry_id uuid not null, consultation_id uuid,
  payment_type text not null default 'self_pay', payment_method text,
  amount numeric not null default 0, deleted_at timestamptz, created_at timestamptz default now()
);
create table public.consultation_documents(
  id uuid primary key, consultation_id uuid not null, patient_id uuid not null,
  template_name text not null, type text, content text not null,
  created_at timestamptz default now()
);
alter table public.consultation_items add constraint consultation_items_source_document_id_fkey
  foreign key (source_document_id) references public.consultation_documents(id);
create table public.completed_bill_correction_audit(
  id uuid primary key, consultation_id uuid not null, queue_entry_id uuid not null,
  actor_id uuid not null, reason text not null, before_state jsonb not null,
  after_state jsonb not null, created_at timestamptz not null default now()
);
create index idx_consultation_items_consultation
  on public.consultation_items (consultation_id);
create index consultation_items_consultation_id_active_idx
  on public.consultation_items (consultation_id) where deleted_at is null;
create index consultations_queue_entry_id_active_idx
  on public.consultations (queue_entry_id) where deleted_at is null;
create unique index consultations_queue_entry_id_active_uidx
  on public.consultations (queue_entry_id) where deleted_at is null;
create index queue_entries_clinic_status_active_idx
  on public.queue_entries (clinic_status) where deleted_at is null;
create index queue_entries_created_at_active_idx
  on public.queue_entries (created_at) where deleted_at is null;
create index idx_queue_entries_kl_date
  on public.queue_entries (
    ((timezone('Asia/Kuala_Lumpur', created_at))::date), clinic_status
  );
create index idx_queue_entries_status_created
  on public.queue_entries (clinic_status, created_at desc);
create index idx_consultation_documents_consultation
  on public.consultation_documents (consultation_id);
`;

function readMigration(): string {
  expect(existsSync(migrationPath), 'Insight performance migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('Insight performance migration contract', () => {
  it('defines a bounded authenticated security-definer RPC', () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /create\s+(?:or\s+replace\s+)?function\s+public\.get_insight_performance\s*\(\s*_start_date\s+date\s*,\s*_end_date\s+date\s*\)/i,
    );
    expect(sql).toMatch(/returns\s+jsonb/i);
    expect(sql).toMatch(/security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(sql).toMatch(/_start_date\s+is\s+null[\s\S]*_end_date\s+is\s+null/i);
    expect(sql).toMatch(/_start_date\s*>\s*_end_date/i);
    expect(sql).toMatch(/\(_end_date\s*-\s*_start_date\)\s*>\s*364/i);
    expect(sql).toMatch(/errcode\s*=\s*'22023'/i);
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.get_insight_performance\s*\(\s*date\s*,\s*date\s*\)\s+from\s+public\s*,\s*anon/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_insight_performance\s*\(\s*date\s*,\s*date\s*\)\s+to\s+authenticated/i,
    );
  });

  it('enforces current Insight roles and account-specific reports.view overrides', () => {
    const sql = readMigration();

    for (const role of [
      'special_admin',
      'admin',
      'doctor_admin',
      'resident_doctor',
      'ops_staff',
      'operations',
    ]) {
      expect(sql).toContain(`'${role}'`);
    }
    expect(sql).toMatch(/from\s+public\.user_roles/i);
    expect(sql).toMatch(/public\.has_clinic_permission\s*\(\s*'reports\.view'/i);
    expect(sql).toMatch(/raise\s+exception\s+'NOT_AUTHORIZED'[\s\S]*errcode\s*=\s*'42501'/i);
    expect(sql).not.toMatch(/(?:'locum'|'guest')[\s\S]*reports\.view[\s\S]*(?:return\s+true|then\s+true)/i);
  });

  it('binds resident identity and suppresses named doctor data for restricted roles', () => {
    const sql = readMigration();

    expect(sql).toMatch(/auth\.uid\s*\(\s*\)/i);
    expect(sql).toMatch(/public\.profiles/i);
    expect(sql).toMatch(/public\.doctors/i);
    expect(sql).toMatch(/v_caller_role\s*=\s*'resident_doctor'[\s\S]*v_caller_doctor_id/i);
    expect(sql).toMatch(/'Clinic benchmark'/i);
    expect(sql).toMatch(/v_caller_role\s+in\s*\(\s*'ops_staff'\s*,\s*'operations'\s*\)[\s\S]*'\[\]'::jsonb/i);
    expect(sql).toMatch(/v_caller_role\s*=\s*'resident_doctor'[\s\S]*service_json[\s\S]*'\[\]'::jsonb/i);
  });

  it('uses completed Malaysia-local visits and authoritative active saved quantities', () => {
    const sql = readMigration();

    expect(sql).toMatch(/timezone\s*\(\s*'Asia\/Kuala_Lumpur'\s*,\s*(?:qe|queue_entry)\.created_at\s*\)::date/i);
    expect(sql).toMatch(/(?:c|consultation)\.status\s*=\s*'completed'/i);
    expect(sql).toMatch(/(?:qe|queue_entry)\.clinic_status(?:::text)?\s*=\s*'completed'/i);
    expect(sql).toMatch(/(?:c|consultation)\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/(?:qe|queue_entry)\.cancelled_at\s+is\s+null/i);
    expect(sql).toMatch(/(?:ci|item)\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/(?:ci|item)\.price\s*\*\s*(?:ci|item)\.quantity/i);
    expect(sql).toMatch(
      /least\s*\(\s*coalesce\s*\(\s*item\.dispensed_qty\s*,\s*item\.quantity\s*\)\s*,\s*greatest\s*\(\s*item\.quantity\s*,\s*0\s*\)/i,
    );
    expect(sql).toMatch(
      /count\s*\(\s*item\.item_id\s*\)\s*filter\s*\(\s*where\s+item\.inventory_item_id\s+is\s+not\s+null[\s\S]*item\.cost_quantity\s*>\s*0[\s\S]*item\.unit_cost\s*<=\s*0/i,
    );
    expect(sql).toMatch(/(?:p|payment)\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/lower\s*\(\s*btrim\s*\(\s*(?:p|payment)\.payment_method\s*\)\s*\)\s*<>\s*'panel'/i);
    expect(sql).toMatch(/timezone\s*\(\s*'Asia\/Kuala_Lumpur'\s*,\s*document\.created_at\s*\)::date[\s\S]*between\s+_start_date\s+and\s+_end_date/i);
    expect(sql).toMatch(/from\s+public\.services\s+as\s+candidate[\s\S]*lower\s*\(\s*trim\s*\(\s*candidate\.name\s*\)\s*\)[\s\S]*lower\s*\(\s*trim\s*\(\s*item\.item_name\s*\)\s*\)/i);
    expect(sql).toMatch(/'excision biopsy'\s*,\s*'excision biopsy \(procedure\)'/i);
  });

  it('ships evidence-backed indexes and explains the representative aggregate, not its wrapper', () => {
    const sql = readMigration();
    const fixture = readFileSync(fixturePath, 'utf8');

    expect(sql).toMatch(/create\s+index[\s\S]*consultation_documents[\s\S]*created_at/i);
    expect(sql).not.toMatch(/create\s+index[^;]+on\s+public\.consultation_items\s*\(\s*consultation_id\s*\)[^;]*deleted_at\s+is\s+null/i);
    expect(bootstrapSql).toMatch(/idx_queue_entries_kl_date[\s\S]*timezone\s*\(\s*'Asia\/Kuala_Lumpur'/i);
    expect(bootstrapSql).toMatch(/consultations_queue_entry_id_active_uidx[\s\S]*queue_entry_id/i);
    expect(bootstrapSql).toMatch(/consultation_items_consultation_id_active_idx[\s\S]*consultation_id/i);
    expect(bootstrapSql).toMatch(/idx_consultation_documents_consultation[\s\S]*consultation_id/i);
    expect(fixture).toMatch(/PERFORMANCE_INTERNAL_PLAN_BEFORE[\s\S]*explain\s*\(\s*analyze\s*,\s*buffers\s*\)[\s\S]*from\s+public\.consultations/i);
    expect(fixture).toMatch(/PERFORMANCE_INTERNAL_PLAN_AFTER[\s\S]*explain\s*\(\s*analyze\s*,\s*buffers\s*\)[\s\S]*from\s+public\.consultations/i);
    expect(fixture).not.toMatch(/explain\s*\(\s*analyze\s*,\s*buffers\s*\)\s*select\s+public\.get_insight_performance/i);
  });

  it('returns the complete aggregate document contract', () => {
    const sql = readMigration();

    for (const key of ['clinic', 'doctors', 'services', 'quality', 'confidence', 'generated_at']) {
      expect(sql).toContain(`'${key}'`);
    }
    for (const key of [
      'doctor_id', 'doctor_name', 'completed_visits', 'unique_patients',
      'rostered_hours', 'patients_per_hour', 'visit_billing', 'revenue_per_hour',
      'procedures', 'documents', 'missing_attribution',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
    for (const key of [
      'service_id', 'service_name', 'volume', 'unique_patients', 'revenue',
      'cogs', 'profit', 'margin_pct', 'average_price', 'trend_pct',
      'doctor_count', 'missing_cost_count',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it.skipIf(!hasPostgresRuntime)(
    'executes exact metrics and role redaction on disposable PostgreSQL 17',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'insight-performance-'));
      const data = join(root, 'data');
      const bootstrap = join(root, 'bootstrap.sql');
      const port = String(61500 + (process.pid % 300));
      const run = (tool: string, args: string[]) => execFileSync(tool, args, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30_000,
        windowsHide: true,
      });
      const control = (args: string[]) => execFileSync(postgresTools.pgCtl, args, {
        stdio: 'ignore',
        timeout: 30_000,
        windowsHide: true,
      });
      const psql = (path: string) => run(postgresTools.psql, [
        '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);

      writeFileSync(bootstrap, bootstrapSql);
      try {
        run(postgresTools.initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8']);
        control(['-D', data, '-o', `-F -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start']);
        psql(bootstrap);
        psql(migrationPath);
        psql(detailMigrationPath);
        psql(roundTwoMigrationPath);
        psql(roundThreeMigrationPath);
        psql(roundFourMigrationPath);
        psql(roundFiveMigrationPath);
        psql(doctorActivityPaymentOnlyMigrationPath);
        const output = psql(fixturePath);
        expect(output).toContain('"status": "pass"');
        expect(output).toContain('"transaction_end": "ROLLBACK"');
        expect(output).toContain('Execution Time:');
        expect(output).toContain('PERFORMANCE_INTERNAL_PLAN_BEFORE');
        expect(output).toContain('PERFORMANCE_INTERNAL_PLAN_AFTER');
        const beforePlan = output.split('PERFORMANCE_INTERNAL_PLAN_BEFORE')[1]
          .split('PERFORMANCE_INTERNAL_PLAN_AFTER')[0];
        const afterPlan = output.split('PERFORMANCE_INTERNAL_PLAN_AFTER')[1];
        expect(beforePlan).toMatch(/Seq Scan on consultation_documents/);
        expect(beforePlan).toMatch(/Index Scan using \S+ on queue_entries queue_entry/);
        expect(beforePlan).toMatch(/Index Scan using \S+ on consultations consultation/);
        expect(beforePlan).toMatch(/Index Scan using \S+ on consultation_items item/);
        expect(afterPlan).toMatch(/Index Scan using \S+ on consultation_documents/);
        const beforeCost = Number(beforePlan.match(/Aggregate\s+\(cost=[\d.]+\.\.([\d.]+)/)?.[1]);
        const afterCost = Number(afterPlan.match(/Aggregate\s+\(cost=[\d.]+\.\.([\d.]+)/)?.[1]);
        expect(Number.isFinite(beforeCost)).toBe(true);
        expect(Number.isFinite(afterCost)).toBe(true);
        expect(afterCost).toBeLessThan(beforeCost);
      } finally {
        try { control(['-D', data, '-m', 'fast', '-w', 'stop']); } catch { /* not started */ }
        rmSync(root, { recursive: true, force: true });
      }
    },
    90_000,
  );
});
