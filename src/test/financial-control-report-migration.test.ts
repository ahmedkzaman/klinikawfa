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

describe('canonical financial control visit facts migration', () => {
  it('defines the private, permission-checked Malaysia-time fact contract', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create or replace function private\.financial_control_visit_facts/i);
    expect(sql).toMatch(/timezone\('Asia\/Kuala_Lumpur'/i);
    expect(sql).toMatch(/can_view_insights\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/revoke all .* from public, anon/i);
    expect(sql).not.toMatch(/create or replace function public\.get_financial_control_/i);
  });

  it.skipIf(!requiresPostgresTest)(
    'reconciles canonical visit facts in disposable PostgreSQL',
    () => {
      requirePostgresRuntime();
      const root = mkdtempSync(join(tmpdir(), 'financial-control-facts-'));
      const dataDirectory = join(root, 'data');
      const bootstrapPath = join(root, 'bootstrap.sql');
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
  updated_at timestamptz not null
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
  ('20000000-0000-4000-8000-000000000005', 'Corrected Patient');
insert into public.doctors values
  ('30000000-0000-4000-8000-000000000001', 'Dr Finance');
insert into public.insurance_providers values
  ('40000000-0000-4000-8000-000000000001', 'Awfa Panel');

insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'completed', 'card', null, '2026-07-31 16:30:00+00', null),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'completed', 'cash', null, '2026-08-02 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'completed', 'cash', null, '2026-07-20 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'completed', 'panel', '40000000-0000-4000-8000-000000000001', '2026-08-03 02:00:00+00', null),
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'completed', 'card', null, '2026-08-03 03:00:00+00', null),
  ('50000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-03 03:00:00+00', '2026-08-03 04:00:00+00');
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000099', '50000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', '2026-08-03 04:00:00+00');
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Full medicine', '80000000-0000-4000-8000-000000000001', null, null, 2, null, 30, 10, null, null),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'Procedure', null, '81000000-0000-4000-8000-000000000001', null, 1, null, 100, 25, null, null),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'Discount', null, null, null, 1, null, -10, 999, 'discount', null),
  ('70000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002', 'Tax', null, null, null, 1, null, 5, 999, 'tax', null),
  ('70000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000003', 'Package', null, null, '82000000-0000-4000-8000-000000000001', 1, null, 80, 30, null, null),
  ('70000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000004', 'Panel service', null, '81000000-0000-4000-8000-000000000002', null, 1, null, 120, 20, null, null),
  ('70000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000005', 'Partial medicine', '80000000-0000-4000-8000-000000000002', null, null, 5, 2, 10, 4, null, null),
  ('70000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000005', 'Zero cost medicine', '80000000-0000-4000-8000-000000000003', null, null, 1, 1, 0, 0, null, null),
  ('70000000-0000-4000-8000-000000000099', '60000000-0000-4000-8000-000000000005', 'Deleted charge', null, null, null, 1, null, 999, 999, null, '2026-08-03 04:00:00+00');
insert into public.payments values
  ('90000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'self_pay', 'card', 60, '2026-08-01 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000002', null, '60000000-0000-4000-8000-000000000002', 'self_pay', 'cash', 40, '2026-08-02 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', null, 'self_pay', 'cash', 30, '2026-07-20 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', null, 'self_pay', 'cash', 20, '2026-08-02 03:00:00+00', null),
  ('90000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'self_pay', 'card', 30, '2026-08-03 05:00:00+00', null),
  ('90000000-0000-4000-8000-000000000098', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'self_pay', 'cash', 777, '2026-08-03 05:30:00+00', null),
  ('90000000-0000-4000-8000-000000000099', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'self_pay', 'cash', 999, '2026-08-03 05:00:00+00', '2026-08-03 06:00:00+00');
insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 120, 50, 'approved', '2026-08-03 03:00:00+00', '2026-08-03 06:00:00+00');
insert into public.completed_bill_correction_audit values
  ('b0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', '{"total": 50, "paid": 50}', '{"total": 50, "paid": 30}', '2026-08-03 06:00:00+00');
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
  if v_count <> 5 then raise exception 'FACT_ROW_COUNT_MISMATCH: %', v_count; end if;

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
      v_row.older_debt_collected_in_period, v_row.cogs, v_row.outstanding)
     is distinct from (80::numeric, 50::numeric, 20::numeric,
       20::numeric, 30::numeric, 30::numeric) then
    raise exception 'OLDER_DEBT_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000004';
  if (v_row.payment_type, v_row.panel_provider_name, v_row.billed,
      v_row.paid_to_date, v_row.paid_in_period, v_row.outstanding, v_row.panel_outstanding)
     is distinct from ('panel'::text, 'Awfa Panel'::text, 120::numeric,
       50::numeric, 50::numeric, 70::numeric, 70::numeric) then
    raise exception 'PANEL_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id = '50000000-0000-4000-8000-000000000005';
  if (v_row.billed, v_row.paid_to_date, v_row.cogs, v_row.refund,
      v_row.outstanding, v_row.missing_cost_count, v_row.zero_price_count,
      v_row.correction_count)
     is distinct from (50::numeric, 30::numeric, 8::numeric, 20::numeric,
       20::numeric, 1, 1, 1) then
    raise exception 'CORRECTED_FACT_MISMATCH: %', row_to_json(v_row);
  end if;

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
end $$;
`, 'utf8');

        psql(bootstrapPath);
        psql(migrationPath);
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
