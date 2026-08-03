import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260803100000_add_financial_control_reports.sql',
);
const postgresBin = process.env.POSTGRES_BIN
  ?? 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const postgresTools = {
  initdb: join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
  pgCtl: join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
  psql: join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql'),
};
const hasPostgresRuntime = Object.values(postgresTools).every(existsSync);
const requiresPostgresTest = process.env.REQUIRE_POSTGRES_TEST === '1' || process.env.CI === 'true';

function requirePostgresRuntime() {
  if (requiresPostgresTest && !hasPostgresRuntime) {
    throw new Error('REQUIRE_POSTGRES_TEST=1 requires initdb, pg_ctl, and psql');
  }
}

describe('financial control reporting migration', () => {
  it('defines the private facts and hardened public reporting contracts', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create or replace function private\.financial_control_visit_facts/i);
    expect(sql).toMatch(/timezone\('Asia\/Kuala_Lumpur'/i);
    expect(sql).toMatch(/can_view_insights\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/revoke all .* from public, anon/i);
    expect(sql).toMatch(/create table private\.financial_visit_completion_events/i);
    expect(sql).toMatch(/create table private\.financial_payment_events/i);
    expect(sql).toMatch(/create table private\.financial_panel_claim_events/i);
    expect(sql).toMatch(/create table private\.financial_zero_price_package_child_events/i);
    expect(sql).toMatch(/synthetic_backfill/i);
    expect(sql).toMatch(/attribution_complete/i);
    expect(sql).not.toMatch(/claim_updated_at[\s\S]*paid_in_period/i);
    expect(sql).toMatch(/create or replace function public\.get_financial_control_summary[\s\S]*returns jsonb[\s\S]*security definer/i);
    expect(sql).toMatch(/create or replace function public\.get_financial_control_details[\s\S]*returns jsonb[\s\S]*security definer/i);
    expect(sql).toMatch(/_metric[\s\S]*'billed_revenue'[\s\S]*'duplicate_or_excess_payment'/i);
    expect(sql).toMatch(/revoke all on function public\.get_financial_control_summary\(date,date,date,date,date\)[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_financial_control_summary\(date,date,date,date,date\)[\s\S]*to authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.get_financial_control_details\(date,date,date,text,text,text,integer,integer\)[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_financial_control_details\(date,date,date,text,text,text,integer,integer\)[\s\S]*to authenticated/i);

    const factFunctionSql = sql.match(
      /create or replace function private\.financial_control_visit_facts[\s\S]*?\$function\$;/i,
    )?.[0];
    expect(factFunctionSql).toBeDefined();
    expect(factFunctionSql).not.toMatch(/public\.package_items/i);
  });

  it.skipIf(!requiresPostgresTest)(
    'reconciles facts and public reports in disposable PostgreSQL',
    () => {
      requirePostgresRuntime();
      const root = mkdtempSync(join(tmpdir(), 'financial-control-facts-'));
      const dataDirectory = join(root, 'data');
      const bootstrapPath = join(root, 'bootstrap.sql');
      const fixturePath = join(root, 'fixture.sql');
      const assertionsPath = join(root, 'assertions.sql');
      const port = String(59000 + (process.pid % 500));
      const run = (tool: string, args: string[]) =>
        execFileSync(tool, args, { encoding: 'utf8', stdio: 'pipe' });
      const control = (args: string[]) =>
        execFileSync(postgresTools.pgCtl, args, { stdio: 'ignore', timeout: 20_000 });
      const psql = (path: string) => run(postgresTools.psql, [
        '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);
      let serverStarted = false;
      let stopError: Error | null = null;

      try {
        run(postgresTools.initdb, [
          '-D', dataDirectory, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8',
        ]);
        control([
          '-D', dataDirectory,
          '-l', join(root, 'postgres.log'),
          '-o', `-h 127.0.0.1 -p ${port} -k ${root}`,
          '-w', 'start',
        ]);
        serverStarted = true;

        writeFileSync(bootstrapPath, `
create schema auth;
create role anon nologin;
create role authenticated nologin;
create table public.patients (
  id uuid primary key,
  name text not null
);
create table public.doctors (
  id uuid primary key,
  name text not null
);
create table public.insurance_providers (
  id uuid primary key,
  name text not null
);
create table public.queue_entries (
  id uuid primary key,
  patient_id uuid not null,
  clinic_status text not null,
  payment_method text,
  panel_id uuid,
  created_at timestamptz not null,
  deleted_at timestamptz
);
create table public.consultations (
  id uuid primary key,
  queue_entry_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid,
  status text not null,
  deleted_at timestamptz
);
create table public.consultation_items (
  id uuid primary key,
  consultation_id uuid not null,
  item_name text not null,
  item_id uuid,
  service_id uuid,
  package_id uuid,
  quantity numeric not null,
  dispensed_qty numeric,
  price numeric not null,
  unit_cost numeric,
  billing_adjustment_kind text,
  deleted_at timestamptz
);
create table public.package_items (
  id uuid primary key,
  package_id uuid not null,
  inventory_item_id uuid,
  service_id uuid
);
create table public.payments (
  id uuid primary key,
  queue_entry_id uuid,
  consultation_id uuid,
  payment_type text,
  payment_method text,
  amount numeric not null,
  created_at timestamptz not null,
  deleted_at timestamptz
);
create table public.panel_claims (
  id uuid primary key,
  queue_entry_id uuid,
  panel_id uuid not null,
  amount numeric not null,
  received_amount numeric,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  due_date date
);
create table public.completed_bill_correction_audit (
  id uuid primary key,
  queue_entry_id uuid not null,
  consultation_id uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function public.can_view_insights(user_id uuid) returns boolean
language sql stable
as $$ select user_id = '10000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function public.completed_bill_correction_state(
  p_queue_entry_id uuid,
  p_consultation_id uuid
) returns jsonb
language sql stable
as $$
  with totals as (
    select
      coalesce(sum(ci.price * ci.quantity), 0)::numeric as total,
      greatest(-coalesce(sum(ci.price * ci.quantity)
        filter (where ci.billing_adjustment_kind = 'discount'), 0), 0)::numeric as discount_rm,
      greatest(coalesce(sum(ci.price * ci.quantity)
        filter (where ci.billing_adjustment_kind = 'tax'), 0), 0)::numeric as tax_rm
    from public.consultation_items ci
    where ci.consultation_id = p_consultation_id
      and ci.deleted_at is null
  ), paid as (
    select coalesce(sum(p.amount), 0)::numeric as paid
    from public.payments p
    where (p.queue_entry_id = p_queue_entry_id or p.consultation_id = p_consultation_id)
      and p.deleted_at is null
  )
  select jsonb_build_object(
    'total', totals.total,
    'discount_rm', totals.discount_rm,
    'tax_rm', totals.tax_rm,
    'paid', paid.paid
  )
  from totals cross join paid
$$;

insert into public.patients values
  ('20000000-0000-4000-8000-000000000001', 'Fully Paid Patient'),
  ('20000000-0000-4000-8000-000000000002', 'Partial Patient'),
  ('20000000-0000-4000-8000-000000000003', 'Older Debt Patient'),
  ('20000000-0000-4000-8000-000000000004', 'Panel Patient'),
  ('20000000-0000-4000-8000-000000000005', 'Corrected Patient'),
  ('20000000-0000-4000-8000-000000000006', 'Unsubmitted Panel Patient'),
  ('20000000-0000-4000-8000-000000000096', 'Legacy Patient');
insert into public.doctors values
  ('30000000-0000-4000-8000-000000000001', 'Dr Finance');
insert into public.insurance_providers values
  ('40000000-0000-4000-8000-000000000001', 'Awfa Panel');

-- This completed visit predates the durable event boundary. The migration must
-- preserve it as explicitly incomplete instead of inventing accounting dates.
insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000096', '20000000-0000-4000-8000-000000000096', 'completed', 'panel', '40000000-0000-4000-8000-000000000001', '2026-07-01 02:00:00+00', null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000096', '50000000-0000-4000-8000-000000000096', '20000000-0000-4000-8000-000000000096', '30000000-0000-4000-8000-000000000001', 'completed', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000096', '60000000-0000-4000-8000-000000000096', 'Legacy service', null, '81000000-0000-4000-8000-000000000096', null, 1, null, 100, 20, null, null);
insert into public.payments values
  ('90000000-0000-4000-8000-000000000096', '50000000-0000-4000-8000-000000000096', '60000000-0000-4000-8000-000000000096', 'panel', 'panel', 10, '2026-07-01 03:00:00+00', null);
insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000096', '50000000-0000-4000-8000-000000000096', '40000000-0000-4000-8000-000000000001', 100, 40, 'approved', '2026-07-01 03:00:00+00', '2026-07-10 03:00:00+00', '2026-07-31');
`, 'utf8');

        writeFileSync(fixturePath, `
alter table public.queue_entries disable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations disable trigger capture_financial_visit_completion_from_consultation;
alter table public.payments disable trigger capture_financial_payment_event;
alter table public.panel_claims disable trigger capture_financial_panel_claim_event;

insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'completed', 'card', null, '2026-07-31 15:55:00+00', null),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'completed', 'cash', null, '2026-08-02 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'completed', 'cash', null, '2026-07-20 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'completed', 'panel', '40000000-0000-4000-8000-000000000001', '2026-08-03 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'completed', 'card', null, '2026-08-03 03:00:00+00', null),
  ('50000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'completed', 'panel', '40000000-0000-4000-8000-000000000001', '2026-08-01 01:00:00+00', null),
  ('50000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-03 03:00:00+00', '2026-08-03 04:00:00+00');
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000099', '50000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', '2026-08-03 04:00:00+00');
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Full medicine', '80000000-0000-4000-8000-000000000001', null, null, 2, null, 30, 10, null, null),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'Procedure', null, '81000000-0000-4000-8000-000000000001', null, 1, null, 100, 25, null, null),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'Discount', null, null, null, 1, null, -10, 999, 'discount', null),
  ('70000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002', 'Tax', null, null, null, 1, null, 5, 999, 'tax', null),
  ('70000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000003', 'Package', null, null, '82000000-0000-4000-8000-000000000001', 1, null, 80, 30, null, null),
  ('70000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000003', 'Included package medicine', '80000000-0000-4000-8000-000000000009', null, null, 1, 1, 0, 0, null, null),
  ('70000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000003', 'Independently charged duplicate medicine', '80000000-0000-4000-8000-000000000009', null, null, 1, 1, 25, 7, null, null),
  ('70000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000003', 'Independently charged missing-cost medicine', '80000000-0000-4000-8000-000000000011', null, null, 1, 1, 15, 0, null, null),
  ('70000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000004', 'Panel service', null, '81000000-0000-4000-8000-000000000002', null, 1, null, 120, 20, null, null),
  ('70000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000005', 'Partial medicine', '80000000-0000-4000-8000-000000000002', null, null, 5, 2, 10, 4, null, null),
  ('70000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000005', 'Zero cost medicine', '80000000-0000-4000-8000-000000000003', null, null, 1, 1, 0, 0, null, null),
  ('70000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000006', 'Loss-making panel service', null, '81000000-0000-4000-8000-000000000012', null, 1, null, 100, 120, null, null),
  ('70000000-0000-4000-8000-000000000099', '60000000-0000-4000-8000-000000000005', 'Deleted charge', null, null, null, 1, null, 999, 999, null, '2026-08-03 04:00:00+00');
insert into public.payments values
  ('90000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'self_pay', 'card', 60, '2026-08-01 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000002', null, '60000000-0000-4000-8000-000000000002', 'self_pay', 'cash', 40, '2026-08-02 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', null, 'self_pay', 'cash', 30, '2026-07-20 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', null, 'self_pay', 'cash', 20, '2026-08-02 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', 'self_pay', 'cash', 10, '2026-08-02 04:00:00+00', null),
  ('90000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'self_pay', 'card', 30, '2026-08-03 05:00:00+00', null),
  ('90000000-0000-4000-8000-000000000098', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'self_pay', 'cash', 777, '2026-08-03 05:30:00+00', null),
  ('90000000-0000-4000-8000-000000000099', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'self_pay', 'cash', 999, '2026-08-03 05:00:00+00', '2026-08-03 06:00:00+00');
insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 120, 90, 'received', '2026-08-01 03:00:00+00', '2026-08-04 06:00:00+00', '2026-08-02'),
  ('a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', '2026-07-30 03:00:00+00', '2026-07-30 03:00:00+00', null);
insert into public.completed_bill_correction_audit values
  ('b0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', '{"total": 50, "paid": 50}', '{"total": 50, "paid": 30}', '2026-08-03 06:00:00+00');
insert into public.package_items values
  ('c0000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000009', null);

alter table public.queue_entries enable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations enable trigger capture_financial_visit_completion_from_consultation;
alter table public.payments enable trigger capture_financial_payment_event;
alter table public.panel_claims enable trigger capture_financial_panel_claim_event;

insert into private.financial_visit_completion_events
  (queue_entry_id, consultation_id, completed_at, provenance, attribution_complete)
values
  ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '2026-07-31 16:05:00+00', 'recorded', true),
  ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '2026-08-02 02:30:00+00', 'recorded', true),
  ('50000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '2026-07-20 02:30:00+00', 'recorded', true),
  ('50000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', '2026-08-01 02:30:00+00', 'recorded', true),
  ('50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', '2026-08-01 03:30:00+00', 'recorded', true),
  ('50000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', '2026-08-01 04:30:00+00', 'recorded', true);

insert into private.financial_zero_price_package_child_events
  (consultation_item_id, consultation_id, package_line_item_id, package_id,
   package_item_id, completed_at, provenance)
values
  ('70000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000003',
   '70000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', '2026-07-20 02:30:00+00',
   'recorded_at_completion');

insert into private.financial_payment_events
  (payment_id, queue_entry_id, consultation_id, event_kind, amount_delta,
   payment_type, payment_method, occurred_at, provenance, attribution_complete)
values
  ('90000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'receipt', 60, 'self_pay', 'card', '2026-08-01 03:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000002', null, '60000000-0000-4000-8000-000000000002', 'receipt', 40, 'self_pay', 'cash', '2026-08-02 03:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', null, 'receipt', 30, 'self_pay', 'cash', '2026-07-20 03:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', null, 'receipt', 20, 'self_pay', 'cash', '2026-08-02 03:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', 'receipt', 10, 'self_pay', 'cash', '2026-08-02 04:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'receipt', 50, 'self_pay', 'card', '2026-08-01 05:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'correction', -20, 'self_pay', 'card', '2026-08-03 05:00:00+00', 'recorded', true);

insert into private.financial_panel_claim_events
  (panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
   received_amount, receipt_delta, status, due_date, occurred_at, provenance,
   attribution_complete)
values
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'claim_created', 120, 0, 0, 'pending', '2026-08-02', '2026-08-01 03:00:00+00', 'recorded', true),
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'receipt', 120, 30, 30, 'submitted', '2026-08-02', '2026-08-01 06:00:00+00', 'recorded', true),
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'receipt', 120, 50, 20, 'submitted', '2026-08-02', '2026-08-02 06:00:00+00', 'recorded', true),
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'claim_edit', 120, 50, 0, 'approved', '2026-08-02', '2026-08-03 06:00:00+00', 'recorded', true),
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'receipt', 120, 90, 40, 'received', '2026-08-02', '2026-08-04 06:00:00+00', 'recorded', true),
  ('a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', 'claim_created', 100, 0, 0, 'pending', null, '2026-07-30 03:00:00+00', 'recorded', true);
`, 'utf8');

        writeFileSync(assertionsPath, `
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

do $$
declare
  v_row record;
  v_count integer;
begin
  select count(*) into v_count
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03');
  if v_count <> 7 then raise exception 'FACT_ROW_COUNT_MISMATCH: %', v_count; end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000001';
  if (v_row.completed_date, v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.older_debt_collected_in_period, v_row.cogs, v_row.outstanding)
     is distinct from ('2026-08-01'::date, 60::numeric, 60::numeric, 60::numeric,
       0::numeric, 20::numeric, 0::numeric) then
    raise exception 'FULLY_PAID_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000002';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period, v_row.cogs,
      v_row.discount, v_row.tax, v_row.outstanding, v_row.payment_method)
     is distinct from (95::numeric, 40::numeric, 40::numeric, 25::numeric,
       10::numeric, 5::numeric, 55::numeric, 'cash'::text) then
    raise exception 'PARTIAL_SELF_PAY_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000003';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.older_debt_collected_in_period, v_row.cogs, v_row.outstanding,
      v_row.missing_cost_count, v_row.zero_price_count)
     is distinct from (120::numeric, 50::numeric, 20::numeric,
       20::numeric, 37::numeric, 70::numeric, 2, 0) then
    raise exception 'OLDER_DEBT_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  delete from public.package_items
  where id = 'c0000000-0000-4000-8000-000000000001';
  insert into public.package_items values
    ('c0000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000011', null);

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000003';
  if (v_row.cogs, v_row.missing_cost_count, v_row.zero_price_count)
     is distinct from (37::numeric, 2, 0) then
    raise exception 'PACKAGE_CATALOG_HISTORY_REWRITE: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000004';
  if (v_row.payment_type, v_row.panel_provider_name, v_row.billed,
      v_row.paid_to_date, v_row.paid_in_period, v_row.outstanding, v_row.panel_outstanding)
     is distinct from ('panel'::text, 'Awfa Panel'::text, 120::numeric,
       60::numeric, 60::numeric, 70::numeric, 70::numeric) then
    raise exception 'PANEL_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000005';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period, v_row.cogs, v_row.refund,
      v_row.outstanding, v_row.missing_cost_count, v_row.zero_price_count,
      v_row.correction_count)
     is distinct from (50::numeric, 30::numeric, 30::numeric, 8::numeric, 20::numeric,
       20::numeric, 1, 1, 1) then
    raise exception 'CORRECTED_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000006';
  if (v_row.payment_type, v_row.billed, v_row.paid_to_date, v_row.cogs,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from ('panel'::text, 100::numeric, 0::numeric, 120::numeric,
       100::numeric, 100::numeric) then
    raise exception 'UNSUBMITTED_PANEL_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-01', '2026-08-01')
  where queue_entry_id = '50000000-0000-4000-8000-000000000005';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.refund)
     is distinct from (50::numeric, 50::numeric, 0::numeric) then
    raise exception 'PRE_CORRECTION_PAYMENT_HISTORY_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-03', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000005';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.refund)
     is distinct from (30::numeric, -20::numeric, 20::numeric) then
    raise exception 'CROSS_PERIOD_REFUND_HISTORY_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-03', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000004';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (60::numeric, 0::numeric, 70::numeric) then
    raise exception 'NON_RECEIPT_PANEL_EDIT_MOVED_CASH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-02', '2026-08-02', '2026-08-02')
  where queue_entry_id = '50000000-0000-4000-8000-000000000004';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (60::numeric, 30::numeric, 70::numeric) then
    raise exception 'MULTIPLE_PANEL_RECEIPTS_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000096';
  if v_row.completed_date is not null
     or v_row.billed is not null
     or v_row.paid_to_date is not null
     or v_row.outstanding is not null then
    raise exception 'LEGACY_SYNTHETIC_FACT_CLAIMED_EXACTNESS: %', row_to_json(v_row);
  end if;

  if not exists (
    select 1
    from private.financial_visit_completion_events event
    where event.consultation_id = '60000000-0000-4000-8000-000000000096'
      and event.completed_at is null
      and event.provenance = 'synthetic_backfill'
      and not event.attribution_complete
  ) then
    raise exception 'LEGACY_COMPLETION_PROVENANCE_MISSING';
  end if;

  if not exists (
    select 1
    from private.financial_panel_claim_events event
    where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000096'
      and event.occurred_at is null
      and event.provenance = 'synthetic_backfill'
      and not event.attribution_complete
  ) then
    raise exception 'LEGACY_PANEL_PROVENANCE_MISSING';
  end if;

  begin
    update private.financial_payment_events
    set amount_delta = 999
    where id = (select min(id) from private.financial_payment_events);
    raise exception 'FINANCIAL_EVENTS_MUTABLE';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform private.financial_control_visit_facts(null, '2026-08-03', '2026-08-03');
    raise exception 'NULL_RANGE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform private.financial_control_visit_facts('2026-08-03', '2026-08-01', '2026-08-03');
    raise exception 'REVERSED_RANGE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-02');
    raise exception 'EARLY_AS_OF_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform private.financial_control_visit_facts('2025-01-01', '2026-01-02', '2026-01-02');
    raise exception 'OVERSIZED_RANGE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Two active, identical receipts four minutes apart make the duplicate predicate
-- executable without changing the Task 1 fixture assertions above.
insert into private.financial_payment_events
  (payment_id, queue_entry_id, consultation_id, event_kind, amount_delta,
   payment_type, payment_method, occurred_at, provenance, attribution_complete)
values
  ('90000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'receipt', 1, 'self_pay', 'card', '2026-08-02 10:00:00+00', 'recorded', true),
  ('90000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'receipt', 1, 'self_pay', 'card', '2026-08-02 10:04:00+00', 'recorded', true);

do $$
declare
  v_summary jsonb;
  v_details jsonb;
  v_alert_order text;
  v_count integer;
  v_value text;
begin
  v_summary := public.get_financial_control_summary(
    '2026-08-01', '2026-08-03', '2026-07-29', '2026-07-31', '2026-08-03'
  );

  if not (v_summary ?& array['period', 'comparison', 'reconciliation', 'alerts', 'generated_at'])
     or jsonb_typeof(v_summary->'period') <> 'object'
     or jsonb_typeof(v_summary->'comparison') <> 'object'
     or jsonb_typeof(v_summary->'reconciliation') <> 'object'
     or jsonb_typeof(v_summary->'alerts') <> 'array'
     or jsonb_typeof(v_summary->'generated_at') <> 'string' then
    raise exception 'SUMMARY_SHAPE_MISMATCH: %', v_summary;
  end if;

  if not (v_summary->'period' ?& array[
      'billedRevenue', 'cashCollected', 'cohortCollected', 'olderDebtCollected',
      'collectionRate', 'cogs', 'grossProfit', 'grossMarginPct',
      'cohortOutstanding', 'totalOutstanding', 'averageBill', 'completedVisits',
      'attributionComplete', 'costComplete', 'incompleteVisits'
    ]) then
    raise exception 'SUMMARY_PERIOD_KEYS_MISSING: %', v_summary->'period';
  end if;

  if ((v_summary #>> '{period,billedRevenue}')::numeric,
      (v_summary #>> '{period,cashCollected}')::numeric,
      (v_summary #>> '{period,cohortCollected}')::numeric,
      (v_summary #>> '{period,olderDebtCollected}')::numeric,
      (v_summary #>> '{period,collectionRate}')::numeric,
      (v_summary #>> '{period,cogs}')::numeric,
      (v_summary #>> '{period,grossProfit}')::numeric,
      (v_summary #>> '{period,grossMarginPct}')::numeric,
      (v_summary #>> '{period,cohortOutstanding}')::numeric,
      (v_summary #>> '{period,totalOutstanding}')::numeric,
      (v_summary #>> '{period,averageBill}')::numeric,
      (v_summary #>> '{period,completedVisits}')::integer,
      (v_summary #>> '{period,incompleteVisits}')::integer)
     is distinct from (
       425::numeric, 212::numeric, 192::numeric, 20::numeric, 45.2::numeric,
       193::numeric, 232::numeric, 54.6::numeric, 245::numeric, 315::numeric,
       85::numeric, 5, 1
     ) then
    raise exception 'SUMMARY_PERIOD_TOTALS_MISMATCH: %', v_summary->'period';
  end if;

  if (v_summary #>> '{period,attributionComplete}')::boolean
     or (v_summary #>> '{period,costComplete}')::boolean then
    raise exception 'SUMMARY_INCOMPLETENESS_HIDDEN: %', v_summary->'period';
  end if;
  if (v_summary #> '{comparison,billedRevenue}') <> 'null'::jsonb
     or (v_summary #>> '{comparison,attributionComplete}')::boolean
     or (v_summary #>> '{comparison,incompleteVisits}')::integer <> 1 then
    raise exception 'COMPARISON_INCOMPLETENESS_INVENTED_AMOUNT: %', v_summary->'comparison';
  end if;

  if ((v_summary #>> '{reconciliation,billedCohort}')::numeric,
      (v_summary #>> '{reconciliation,cohortCollected}')::numeric,
      (v_summary #>> '{reconciliation,olderDebtCollected}')::numeric,
      (v_summary #>> '{reconciliation,discounts}')::numeric,
      (v_summary #>> '{reconciliation,taxes}')::numeric,
      (v_summary #>> '{reconciliation,refunds}')::numeric,
      (v_summary #>> '{reconciliation,corrections}')::integer,
      (v_summary #>> '{reconciliation,selfPayOutstanding}')::numeric,
      (v_summary #>> '{reconciliation,panelOutstanding}')::numeric)
     is distinct from (
       425::numeric, 192::numeric, 20::numeric, 10::numeric, 5::numeric,
       20::numeric, 1, 145::numeric, 170::numeric
     ) then
    raise exception 'RECONCILIATION_MISMATCH: %', v_summary->'reconciliation';
  end if;

  select string_agg(alert->>'key', ',' order by ordinal), count(*)
    into v_alert_order, v_count
  from jsonb_array_elements(v_summary->'alerts') with ordinality alerts(alert, ordinal);
  if v_count <> 10
     or v_alert_order <> 'duplicate_or_excess_payment,negative_margin,overdue_panel,unpaid_self_pay,unsubmitted_panel,missing_cost,payment_mismatch,refund_void_correction,large_discount,zero_price' then
    raise exception 'ALERT_ORDER_MISMATCH: %', v_summary->'alerts';
  end if;

  if (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'unpaid_self_pay') <> 2
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'unsubmitted_panel') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'overdue_panel') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'missing_cost') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'zero_price') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'negative_margin') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'large_discount') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'refund_void_correction') <> 1
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'payment_mismatch') <> 5
     or (select (alert->>'count')::integer from jsonb_array_elements(v_summary->'alerts') alert where alert->>'key' = 'duplicate_or_excess_payment') <> 1 then
    raise exception 'ALERT_COUNTS_MISMATCH: %', v_summary->'alerts';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_summary->'alerts') alert
    where (alert->>'attributionComplete')::boolean
       or (alert->>'incompleteRows')::integer <> 1
  ) then
    raise exception 'ALERT_INCOMPLETENESS_HIDDEN: %', v_summary->'alerts';
  end if;

  v_summary := public.get_financial_control_summary(
    '2026-07-29', '2026-07-31', '2026-07-26', '2026-07-28', '2026-07-31'
  );
  if (v_summary #> '{period,billedRevenue}') <> 'null'::jsonb
     or (v_summary #> '{reconciliation,billedCohort}') <> 'null'::jsonb
     or (v_summary #>> '{reconciliation,attributionComplete}')::boolean then
    raise exception 'EMPTY_KNOWN_COHORT_INVENTED_ZERO: %', v_summary;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'visit', null, 1, 2
  );
  if not (v_details ?& array['rows', 'total', 'page', 'pageSize', 'totals'])
     or jsonb_typeof(v_details->'rows') <> 'array'
     or (v_details->>'total')::integer <> 6
     or (v_details->>'page')::integer <> 1
     or (v_details->>'pageSize')::integer <> 2
     or jsonb_array_length(v_details->'rows') <> 2 then
    raise exception 'DETAIL_SHAPE_MISMATCH: %', v_details;
  end if;
  if v_details #>> '{rows,0,queueEntryId}' <> '50000000-0000-4000-8000-000000000004'
     or v_details #>> '{rows,1,queueEntryId}' <> '50000000-0000-4000-8000-000000000006' then
    raise exception 'DETAIL_ORDER_MISMATCH: %', v_details->'rows';
  end if;
  if ((v_details #>> '{totals,billed}')::numeric,
      (v_details #>> '{totals,paid}')::numeric,
      (v_details #>> '{totals,outstanding}')::numeric,
      (v_details #>> '{totals,cogs}')::numeric,
      (v_details #>> '{totals,profit}')::numeric,
      (v_details #>> '{totals,incompleteRows}')::integer)
     is distinct from (425::numeric, 192::numeric, 245::numeric, 193::numeric, 232::numeric, 1)
     or (v_details #>> '{totals,attributionComplete}')::boolean then
    raise exception 'DETAIL_TOTALS_MISMATCH: %', v_details->'totals';
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'visit', null, 3, 2
  );
  if v_details #>> '{rows,1,queueEntryId}' <> '50000000-0000-4000-8000-000000000096'
     or (v_details #> '{rows,1,billed}') <> 'null'::jsonb
     or (v_details #>> '{rows,1,attributionComplete}')::boolean then
    raise exception 'DETAIL_INCOMPLETE_ROW_MISMATCH: %', v_details->'rows';
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'doctor', null, 1, 20
  );
  if (v_details->>'total')::integer <> 2
     or v_details #>> '{rows,0,groupLabel}' <> 'Dr Finance'
     or (v_details #>> '{rows,0,billed}')::numeric <> 425 then
    raise exception 'DOCTOR_GROUP_MISMATCH: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'medicine', null, 1, 20
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'groupLabel' = 'Full medicine'
      and (row_value->>'billed')::numeric = 60
  ) then
    raise exception 'MEDICINE_GROUP_MISMATCH: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'alerts', 'visit', 'negative_margin', 1, 20
  );
  if v_details #>> '{rows,0,queueEntryId}' <> '50000000-0000-4000-8000-000000000006'
     or not ((v_details #> '{rows,0,alertKeys}') ? 'negative_margin') then
    raise exception 'ALERT_DETAIL_MISMATCH: %', v_details;
  end if;

  foreach v_value in array array[
    'billed_revenue', 'cash_collected', 'cohort_outstanding',
    'total_outstanding', 'cogs', 'gross_profit', 'adjustments', 'alerts', 'margin'
  ] loop
    perform public.get_financial_control_details(
      '2026-08-01', '2026-08-03', '2026-08-03', v_value, 'visit', null, 1, 20
    );
  end loop;
  foreach v_value in array array[
    'visit', 'medicine', 'procedure', 'package',
    'doctor', 'payment_type', 'panel_provider'
  ] loop
    perform public.get_financial_control_details(
      '2026-08-01', '2026-08-03', '2026-08-03',
      'billed_revenue', v_value, null, 1, 20
    );
  end loop;

  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'not_a_metric', 'visit', null, 1, 20);
    raise exception 'INVALID_METRIC_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'margin', 'not_a_group', null, 1, 20);
    raise exception 'INVALID_GROUP_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'alerts', 'visit', 'not_an_alert', 1, 20);
    raise exception 'INVALID_ALERT_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'margin', 'visit', null, 0, 20);
    raise exception 'INVALID_PAGE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'margin', 'visit', null, 1, 101);
    raise exception 'INVALID_PAGE_SIZE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_financial_control_summary('2026-08-03', '2026-08-01', '2026-07-29', '2026-07-31', '2026-08-03');
    raise exception 'INVALID_SUMMARY_DATES_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000099', false);
do $$
begin
  begin
    perform public.get_financial_control_summary('2026-08-01', '2026-08-03', '2026-07-29', '2026-07-31', '2026-08-03');
    raise exception 'UNAUTHORIZED_SUMMARY_ACCESS';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.get_financial_control_details('2026-08-01', '2026-08-03', '2026-08-03', 'margin', 'visit', null, 1, 20);
    raise exception 'UNAUTHORIZED_DETAIL_ACCESS';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

set role authenticated;
do $$
begin
  perform public.get_financial_control_summary(
    '2026-08-01', '2026-08-03', '2026-07-29', '2026-07-31', '2026-08-03'
  );
  perform public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03', 'margin', 'visit', null, 1, 20
  );
end $$;
reset role;

insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000095', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', '2026-08-03 07:00:00+00', null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000095', '50000000-0000-4000-8000-000000000095', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000095', '60000000-0000-4000-8000-000000000095', 'Trigger package', null, null, '82000000-0000-4000-8000-000000000095', 1, null, 50, 20, null, null),
  ('70000000-0000-4000-8000-000000000094', '60000000-0000-4000-8000-000000000095', 'Trigger included medicine', '80000000-0000-4000-8000-000000000095', null, null, 1, 1, 0, 0, null, null);
insert into public.package_items values
  ('c0000000-0000-4000-8000-000000000095', '82000000-0000-4000-8000-000000000095', '80000000-0000-4000-8000-000000000095', null);
update public.queue_entries
set clinic_status = 'completed'
where id = '50000000-0000-4000-8000-000000000095';
update public.consultations
set status = 'completed'
where id = '60000000-0000-4000-8000-000000000095';

insert into public.payments values
  ('90000000-0000-4000-8000-000000000095', '50000000-0000-4000-8000-000000000095', '60000000-0000-4000-8000-000000000095', 'self_pay', 'cash', 12, statement_timestamp(), null);
update public.payments
set amount = 7
where id = '90000000-0000-4000-8000-000000000095';

insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000095', '50000000-0000-4000-8000-000000000095', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), null);
update public.panel_claims
set received_amount = 25,
    status = 'submitted'
where id = 'a0000000-0000-4000-8000-000000000095';
update public.panel_claims
set status = 'approved'
where id = 'a0000000-0000-4000-8000-000000000095';

do $$
begin
  if not exists (
    select 1
    from private.financial_visit_completion_events event
    where event.consultation_id = '60000000-0000-4000-8000-000000000095'
      and event.completed_at is not null
      and event.provenance = 'recorded'
      and event.attribution_complete
  ) then
    raise exception 'COMPLETION_TRIGGER_EVENT_MISSING';
  end if;

  if not exists (
    select 1
    from private.financial_zero_price_package_child_events event
    where event.consultation_item_id = '70000000-0000-4000-8000-000000000094'
      and event.package_line_item_id = '70000000-0000-4000-8000-000000000095'
      and event.package_item_id = 'c0000000-0000-4000-8000-000000000095'
      and event.provenance = 'recorded_at_completion'
  ) then
    raise exception 'ZERO_PRICE_PACKAGE_CHILD_TRIGGER_EVENT_MISSING';
  end if;

  if (select sum(event.amount_delta)
      from private.financial_payment_events event
      where event.payment_id = '90000000-0000-4000-8000-000000000095') <> 7 then
    raise exception 'PAYMENT_TRIGGER_DELTA_MISMATCH';
  end if;

  if (select count(*)
      from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000095'
        and event.event_kind = 'receipt'
        and event.receipt_delta = 25) <> 1 then
    raise exception 'PANEL_RECEIPT_TRIGGER_EVENT_MISSING';
  end if;

  if (select count(*)
      from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000095'
        and event.event_kind = 'claim_edit'
        and event.receipt_delta = 0) <> 1 then
    raise exception 'PANEL_EDIT_TRIGGER_EVENT_MISSING';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000099', false);
do $$
begin
  begin
    perform private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03');
    raise exception 'UNAUTHORIZED_FACT_ACCESS';
  exception when sqlstate '42501' then null;
  end;
end $$;

do $$
begin
  if has_function_privilege('anon', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     or has_function_privilege('authenticated', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     or has_function_privilege('public', 'private.financial_control_visit_facts(date,date,date)', 'execute') then
    raise exception 'PRIVATE_FACT_EXECUTE_EXPOSED';
  end if;

  if has_function_privilege('anon', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     or has_function_privilege('public', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute') then
    raise exception 'SUMMARY_GRANTS_MISMATCH';
  end if;
  if has_function_privilege('anon', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute')
     or has_function_privilege('public', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute') then
    raise exception 'DETAIL_GRANTS_MISMATCH';
  end if;
end $$;
`, 'utf8');

        psql(bootstrapPath);
        psql(migrationPath);
        psql(fixturePath);
        psql(assertionsPath);
      } finally {
        if (serverStarted) {
          try {
            execFileSync(
              postgresTools.pgCtl,
              ['-D', dataDirectory, '-m', 'immediate', '-w', '-t', '10', 'stop'],
              { stdio: 'ignore', timeout: 15_000 },
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stopError = new Error(`Failed to stop disposable PostgreSQL: ${message}`);
          }
        }
        if (!stopError) rmSync(root, { recursive: true, force: true });
      }

      if (stopError) throw stopError;
    },
    120_000,
  );
});
