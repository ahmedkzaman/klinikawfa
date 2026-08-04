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
const portionMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260804120000_add_panel_claim_payment_portions.sql',
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

  it('reconciles split claim receipts without changing public report shapes', () => {
    const sql = readFileSync(portionMigrationPath, 'utf8');

    expect(sql).toMatch(
      /create or replace function private\.capture_financial_panel_claim_portion_receipt_event/i,
    );
    expect(sql).toMatch(
      /after insert on public\.panel_claim_portion_receipts[\s\S]*capture_financial_panel_claim_portion_receipt_event/is,
    );
    expect(sql).toMatch(
      /v_is_split := exists \([\s\S]*from public\.panel_claim_portions[\s\S]*if v_is_split and tg_op = 'update' then\s+v_delta := 0/is,
    );
    expect(sql).toMatch(
      /'reassignment_out'[\s\S]*case when v_is_split then 0 else -v_before_received end/is,
    );
    expect(sql).toMatch(
      /'reassignment_in'[\s\S]*case when v_is_split then 0 else v_after_received end/is,
    );
    expect(sql).toMatch(
      /sum\(\s*greatest\(\s*portion\.amount - coalesce\(receipts\.received_amount, 0\),\s*0\s*\)\s*\)/i,
    );
    expect(sql).toMatch(
      /child_cash[\s\S]*private\.financial_panel_claim_events[\s\S]*event\.queue_entry_id = fact\.queue_entry_id[\s\S]*event\.event_kind = 'receipt'/is,
    );
    expect(sql).toMatch(
      /create or replace function public\.get_clinic_health_metrics[\s\S]*panel_claim_portions/is,
    );
    expect(sql).not.toMatch(
      /create or replace function public\.get_financial_control_(summary|details)/i,
    );
  });

  it.skipIf(!requiresPostgresTest)(
    'reconciles facts and reports while enforcing panel-portion runtime security in disposable PostgreSQL',
    () => {
      requirePostgresRuntime();
      const root = mkdtempSync(join(tmpdir(), 'financial-control-facts-'));
      const dataDirectory = join(root, 'data');
      const bootstrapPath = join(root, 'bootstrap.sql');
      const fixturePath = join(root, 'fixture.sql');
      const assertionsPath = join(root, 'assertions.sql');
      const portionBootstrapPath = join(root, 'portion-bootstrap.sql');
      const splitFixturePath = join(root, 'split-fixture.sql');
      const portionSecurityAssertionsPath = join(root, 'portion-security-assertions.sql');
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
create table public.clinic_charge_types (
  id uuid primary key,
  name text not null,
  is_active boolean not null default true
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
  deleted_at timestamptz,
  clinic_charge_type_id uuid references public.clinic_charge_types(id)
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
  ), items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id,
      'item_name', ci.item_name,
      'quantity', ci.quantity,
      'price', ci.price,
      'item_id', ci.item_id,
      'service_id', ci.service_id,
      'package_id', ci.package_id,
      'dispensed_qty', ci.dispensed_qty,
      'adjustment_kind', ci.billing_adjustment_kind,
      'charge_type_id', ci.clinic_charge_type_id
    ) order by ci.id), '[]'::jsonb) as value
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
    'items', items.value,
    'paid', paid.paid
  )
  from totals cross join items cross join paid
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
insert into public.clinic_charge_types values
  ('83000000-0000-4000-8000-000000000001', 'Completion administration', true),
  ('83000000-0000-4000-8000-000000000002', 'Mutated administration', true);

-- This completed visit predates the durable event boundary. The migration must
-- preserve it as explicitly incomplete instead of inventing accounting dates.
insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000096', '20000000-0000-4000-8000-000000000096', 'completed', 'panel', '40000000-0000-4000-8000-000000000001', '2026-07-01 02:00:00+00', null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000096', '50000000-0000-4000-8000-000000000096', '20000000-0000-4000-8000-000000000096', '30000000-0000-4000-8000-000000000001', 'completed', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000096', '60000000-0000-4000-8000-000000000096', 'Legacy service', null, '81000000-0000-4000-8000-000000000096', null, 1, null, 100, 20, null, null, null);
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
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Full medicine', '80000000-0000-4000-8000-000000000001', null, null, 2, null, 30, 10, null, null, null),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'Procedure', null, '81000000-0000-4000-8000-000000000001', null, 1, null, 100, 25, null, null, null),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'Discount', null, null, null, 1, null, -10, 999, 'discount', null, null),
  ('70000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002', 'Tax', null, null, null, 1, null, 5, 999, 'tax', null, null),
  ('70000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000003', 'Package', null, null, '82000000-0000-4000-8000-000000000001', 1, null, 80, 30, null, null, null),
  ('70000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000003', 'Included package medicine', '80000000-0000-4000-8000-000000000009', null, null, 1, 1, 0, 0, null, null, null),
  ('70000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000003', 'Independently charged duplicate medicine', '80000000-0000-4000-8000-000000000009', null, null, 1, 1, 25, 7, null, null, null),
  ('70000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000003', 'Independently charged missing-cost medicine', '80000000-0000-4000-8000-000000000011', null, null, 1, 1, 15, 0, null, null, null),
  ('70000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000004', 'Panel service', null, '81000000-0000-4000-8000-000000000002', null, 1, null, 120, 20, null, null, null),
  ('70000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000005', 'Partial medicine', '80000000-0000-4000-8000-000000000002', null, null, 5, 2, 10, 4, null, null, null),
  ('70000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000005', 'Zero cost medicine', '80000000-0000-4000-8000-000000000003', null, null, 1, 1, 0, 0, null, null, null),
  ('70000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000006', 'Loss-making panel service', null, '81000000-0000-4000-8000-000000000012', null, 1, null, 100, 120, null, null, null),
  ('70000000-0000-4000-8000-000000000099', '60000000-0000-4000-8000-000000000005', 'Deleted charge', null, null, null, 1, null, 999, 999, null, '2026-08-03 04:00:00+00', null);
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
  (queue_entry_id, consultation_id, completed_at, provenance, attribution_complete, item_state)
select fixture.queue_entry_id, fixture.consultation_id, fixture.completed_at,
  'recorded', true,
  private.financial_control_completion_item_state(fixture.consultation_id)
from (values
  ('50000000-0000-4000-8000-000000000001'::uuid, '60000000-0000-4000-8000-000000000001'::uuid, '2026-07-31 16:05:00+00'::timestamptz),
  ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '2026-08-02 02:30:00+00'),
  ('50000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '2026-07-20 02:30:00+00'),
  ('50000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', '2026-08-01 02:30:00+00'),
  ('50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', '2026-08-01 03:30:00+00'),
  ('50000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', '2026-08-01 04:30:00+00')
) fixture(queue_entry_id, consultation_id, completed_at);

-- These live-row rewrites occur after the report date. Historical item detail and
-- visit COGS must continue to use the completion/correction snapshots.
insert into public.completed_bill_correction_audit
select
  'b0000000-0000-4000-8000-000000000011',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  public.completed_bill_correction_state(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  ),
  '{"total": 0, "discount_rm": 0, "tax_rm": 0, "paid": 60, "items": []}'::jsonb,
  '2026-08-04 04:00:00+00';
insert into public.completed_bill_correction_audit
select
  'b0000000-0000-4000-8000-000000000012',
  '50000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002',
  public.completed_bill_correction_state(
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002'
  ),
  jsonb_build_object(
    'total', 200,
    'discount_rm', 0,
    'tax_rm', 0,
    'paid', 40,
    'items', jsonb_build_array(jsonb_build_object(
      'id', '70000000-0000-4000-8000-000000000002',
      'item_name', 'Rewritten procedure',
      'quantity', 1,
      'price', 200,
      'item_id', null,
      'service_id', null,
      'package_id', null,
      'dispensed_qty', null,
      'adjustment_kind', null
    ))
  ),
  '2026-08-04 04:05:00+00';

update public.consultation_items
set item_name = 'Rewritten and deleted medicine', item_id = null,
  price = 600, unit_cost = 400, deleted_at = '2026-08-04 04:00:00+00'
where id = '70000000-0000-4000-8000-000000000001';
update public.consultation_items
set item_name = 'Rewritten procedure', service_id = null, price = 200, unit_cost = 90
where id = '70000000-0000-4000-8000-000000000002';
update public.consultation_items
set deleted_at = '2026-08-04 04:05:00+00'
where id in (
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000004'
);

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
  v_group text;
  v_alert text;
  v_medicine_billed numeric;
  v_procedure_billed numeric;
  v_package_billed numeric;
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
      and row_value->>'groupKey' = '80000000-0000-4000-8000-000000000001'
      and (row_value->>'billed')::numeric = 60
      and (row_value->>'cogs')::numeric = 20
  ) then
    raise exception 'HISTORICAL_MEDICINE_GROUP_MISMATCH: %', v_details;
  end if;
  v_medicine_billed := (v_details #>> '{totals,billed}')::numeric;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'procedure', null, 1, 20
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'groupLabel' = 'Procedure'
      and row_value->>'groupKey' = '81000000-0000-4000-8000-000000000001'
      and (row_value->>'billed')::numeric = 95
      and (row_value->>'discount')::numeric = 10
      and (row_value->>'tax')::numeric = 5
  ) then
    raise exception 'NET_PROCEDURE_RECONCILIATION_MISMATCH: %', v_details;
  end if;
  if abs((v_details #>> '{totals,billed}')::numeric - 315) > 0.01 then
    raise exception 'PROCEDURE_TOTALS_DO_NOT_RECONCILE: %', v_details->'totals';
  end if;
  v_procedure_billed := (v_details #>> '{totals,billed}')::numeric;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'package', null, 1, 20
  );
  select coalesce(sum((row_value->>'billed')::numeric), 0)
    into v_package_billed
  from jsonb_array_elements(v_details->'rows') row_value
  where (row_value->>'attributionComplete')::boolean;
  if abs(v_medicine_billed + v_procedure_billed + v_package_billed - 425) > 0.01 then
    raise exception 'ITEM_GROUP_TOTALS_DO_NOT_RECONCILE: %, %, %',
      v_medicine_billed, v_procedure_billed, v_package_billed;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-02', '2026-08-02', '2026-08-03',
    'cash_collected', 'medicine', null, 1, 100
  );
  if abs(coalesce((select sum((row_value->>'amount')::numeric)
      from jsonb_array_elements(v_details->'rows') row_value
      where row_value->>'groupKey' in (
        '80000000-0000-4000-8000-000000000009',
        '80000000-0000-4000-8000-000000000011'
      )), 0) - 6.67) > 0.01 then
    raise exception 'ITEM_PERIOD_CASH_USES_LIFETIME_TOTAL: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-02', '2026-08-02', '2026-08-03',
    'cash_collected', 'visit', null, 1, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'queueEntryId' = '50000000-0000-4000-8000-000000000003'
      and (row_value->>'paid')::numeric = 20
      and (row_value->>'paidInPeriod')::numeric = 20
      and (row_value->>'amount')::numeric = 20
  ) then
    raise exception 'VISIT_PERIOD_PAID_USES_LIFETIME_TOTAL: %', v_details;
  end if;
  if (v_details #>> '{totals,paid}')::numeric <> 92
     or coalesce((
       select sum((row_value->>'paid')::numeric)
       from jsonb_array_elements(v_details->'rows') row_value
       where (row_value->>'attributionComplete')::boolean
     ), 0) <> 92 then
    raise exception 'VISIT_PERIOD_PAID_TOTAL_DOES_NOT_RECONCILE: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'adjustments', 'procedure', null, 1, 20
  );
  if (v_details #>> '{rows,0,amount}')::numeric <> 15
     or (v_details #>> '{rows,0,discount}')::numeric <> 10
     or (v_details #>> '{rows,0,tax}')::numeric <> 5 then
    raise exception 'ITEM_ADJUSTMENT_FIELDS_DISCARDED: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'alerts', 'procedure', 'large_discount', 1, 20
  );
  if (v_details #>> '{rows,0,amount}')::numeric <> 10
     or not ((v_details #> '{rows,0,alertKeys}') ? 'large_discount') then
    raise exception 'ITEM_ALERT_PAYLOAD_MISMATCH: %', v_details;
  end if;

  foreach v_value in array array['doctor', 'payment_type'] loop
    v_details := public.get_financial_control_details(
      '2026-08-01', '2026-08-03', '2026-08-03',
      'alerts', v_value, 'large_discount', 1, 20
    );
    if (v_details #>> '{rows,0,amount}')::numeric <> 10
       or not ((v_details #> '{rows,0,alertKeys}') ? 'large_discount') then
      raise exception 'DIMENSION_ALERT_PAYLOAD_MISMATCH (%): %', v_value, v_details;
    end if;
  end loop;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'alerts', 'panel_provider', 'negative_margin', 1, 20
  );
  if (v_details #>> '{rows,0,amount}')::numeric <> 20
     or not ((v_details #> '{rows,0,alertKeys}') ? 'negative_margin') then
    raise exception 'PANEL_ALERT_PAYLOAD_MISMATCH: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'alerts', 'medicine', 'refund_void_correction', 1, 20
  );
  if (v_details #>> '{rows,0,amount}')::numeric <> 20
     or not ((v_details #> '{rows,0,alertKeys}') ? 'refund_void_correction')
     or (v_details #>> '{rows,0,refund}')::numeric <> 20
     or (v_details #>> '{rows,0,corrections}')::integer <> 1 then
    raise exception 'ITEM_REFUND_CORRECTION_PAYLOAD_MISMATCH: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'alerts', 'visit', 'negative_margin', 1, 20
  );
  if v_details #>> '{rows,0,queueEntryId}' <> '50000000-0000-4000-8000-000000000006'
     or not ((v_details #> '{rows,0,alertKeys}') ? 'negative_margin') then
    raise exception 'ALERT_DETAIL_MISMATCH: %', v_details;
  end if;

  foreach v_group in array array[
    'visit', 'medicine', 'procedure', 'package',
    'doctor', 'payment_type', 'panel_provider'
  ] loop
    foreach v_value in array array[
      'billed_revenue', 'cash_collected', 'cohort_outstanding',
      'total_outstanding', 'cogs', 'gross_profit', 'adjustments', 'alerts', 'margin'
    ] loop
      v_details := public.get_financial_control_details(
        '2026-08-01', '2026-08-03', '2026-08-03',
        v_value, v_group, null, 1, 100
      );
      if jsonb_typeof(v_details->'rows') <> 'array'
         or exists (
           select 1 from jsonb_array_elements(v_details->'rows') row_value
           where not (row_value ?& array[
             'amount', 'discount', 'tax', 'refund', 'corrections', 'alertKeys'
           ]) or jsonb_typeof(row_value->'alertKeys') <> 'array'
         ) then
        raise exception 'METRIC_GROUP_CONTRACT_MISMATCH (%, %): %',
          v_value, v_group, v_details;
      end if;
      if v_value = 'cash_collected' and (
        exists (
          select 1 from jsonb_array_elements(v_details->'rows') row_value
          where (row_value->>'attributionComplete')::boolean
            and abs((row_value->>'paid')::numeric - (row_value->>'amount')::numeric) > 0.01
        )
        or abs(
          (v_details #>> '{totals,paid}')::numeric
          - coalesce((
            select sum((row_value->>'paid')::numeric)
            from jsonb_array_elements(v_details->'rows') row_value
            where (row_value->>'attributionComplete')::boolean
          ), 0)
        ) > 0.01
      ) then
        raise exception 'CASH_PAID_FIELD_DOES_NOT_RECONCILE (%, %): %',
          v_value, v_group, v_details;
      end if;
    end loop;

    foreach v_alert in array array[
      'unpaid_self_pay', 'unsubmitted_panel', 'overdue_panel', 'missing_cost',
      'zero_price', 'negative_margin', 'large_discount', 'refund_void_correction',
      'payment_mismatch', 'duplicate_or_excess_payment'
    ] loop
      v_details := public.get_financial_control_details(
        '2026-08-01', '2026-08-03', '2026-08-03',
        'alerts', v_group, v_alert, 1, 100
      );
      if exists (
        select 1 from jsonb_array_elements(v_details->'rows') row_value
        where (row_value->>'attributionComplete')::boolean
          and not ((row_value->'alertKeys') ? v_alert)
      ) then
        raise exception 'ALERT_GROUP_KEY_MISMATCH (%, %): %',
          v_alert, v_group, v_details;
      end if;
    end loop;
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

alter table public.queue_entries disable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations disable trigger capture_financial_visit_completion_from_consultation;

update public.queue_entries
set clinic_status = 'cancelled', deleted_at = '2026-08-04 08:00:00+00'
where id = '50000000-0000-4000-8000-000000000003';
update public.consultations
set status = 'cancelled', deleted_at = '2026-08-04 08:00:00+00'
where id = '60000000-0000-4000-8000-000000000003';

update public.queue_entries
set clinic_status = 'waiting'
where id = '50000000-0000-4000-8000-000000000001';
update public.consultations
set status = 'in_progress'
where id = '60000000-0000-4000-8000-000000000001';

update public.queue_entries
set deleted_at = '2026-08-04 08:05:00+00'
where id = '50000000-0000-4000-8000-000000000002';
update public.consultations
set deleted_at = '2026-08-04 08:05:00+00'
where id = '60000000-0000-4000-8000-000000000002';

alter table public.queue_entries enable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations enable trigger capture_financial_visit_completion_from_consultation;

insert into private.financial_visit_completion_events
  (queue_entry_id, consultation_id, event_kind, completed_at, provenance,
   attribution_complete, item_state)
values
  ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'void', '2026-08-04 08:10:00+00', 'recorded', true, null),
  ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'void', '2026-08-04 08:10:00+00', 'recorded', true, null),
  ('50000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'void', '2026-08-04 08:10:00+00', 'recorded', true, null);

do $$
declare
  v_count integer;
  v_summary jsonb;
  v_details jsonb;
begin

  select count(*) into v_count
  from private.financial_control_visit_facts('2026-08-01', '2026-08-03', '2026-08-03')
  where queue_entry_id in (
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003'
  );
  if v_count <> 3 then
    raise exception 'HISTORICAL_COMPLETION_DISAPPEARED_AFTER_STATUS_CHANGE: %', v_count;
  end if;

  v_summary := public.get_financial_control_summary(
    '2026-08-01', '2026-08-03', '2026-07-29', '2026-07-31', '2026-08-03'
  );
  if (v_summary #>> '{period,completedVisits}')::integer <> 5 then
    raise exception 'HISTORICAL_SUMMARY_CHANGED_AFTER_STATUS_CHANGE: %', v_summary;
  end if;
  v_details := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'visit', null, 1, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'queueEntryId' = '50000000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'queueEntryId' = '50000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'HISTORICAL_DETAILS_CHANGED_AFTER_STATUS_CHANGE: %', v_details;
  end if;

  select count(*) into v_count
  from private.financial_control_visit_facts(
    '2026-08-01',
    '2026-08-03',
    '2026-08-04'
  )
  where queue_entry_id in (
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003'
  );
  if v_count <> 0 then
    raise exception 'CURRENT_VOIDED_COMPLETION_REMAINS_ELIGIBLE: %', v_count;
  end if;

end $$;

-- Equal-value groups from the same visit straddle a page boundary. The final
-- group key must make both pages repeatable and non-overlapping.
alter table public.queue_entries disable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations disable trigger capture_financial_visit_completion_from_consultation;
insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-03 07:00:00+00', null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000071', '60000000-0000-4000-8000-000000000007', 'Tie medicine A', '80000000-0000-4000-8000-000000000071', null, null, 1, 1, 50, 10, null, null, null),
  ('70000000-0000-4000-8000-000000000072', '60000000-0000-4000-8000-000000000007', 'Tie medicine B', '80000000-0000-4000-8000-000000000072', null, null, 1, 1, 50, 10, null, null, null);
insert into private.financial_visit_completion_events
  (queue_entry_id, consultation_id, completed_at, provenance, attribution_complete, item_state)
values (
  '50000000-0000-4000-8000-000000000007',
  '60000000-0000-4000-8000-000000000007',
  '2026-08-03 07:30:00+00',
  'recorded',
  true,
  private.financial_control_completion_item_state('60000000-0000-4000-8000-000000000007')
);
alter table public.queue_entries enable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations enable trigger capture_financial_visit_completion_from_consultation;

do $$
declare
  v_page_2 jsonb;
  v_page_2_repeat jsonb;
  v_page_3 jsonb;
begin
  v_page_2 := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'medicine', null, 2, 1
  );
  v_page_2_repeat := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'medicine', null, 2, 1
  );
  v_page_3 := public.get_financial_control_details(
    '2026-08-01', '2026-08-03', '2026-08-03',
    'billed_revenue', 'medicine', null, 3, 1
  );
  if v_page_2 #>> '{rows,0,groupKey}' <> '80000000-0000-4000-8000-000000000071'
     or v_page_3 #>> '{rows,0,groupKey}' <> '80000000-0000-4000-8000-000000000072'
     or v_page_2 #>> '{rows,0,groupKey}' <> v_page_2_repeat #>> '{rows,0,groupKey}' then
    raise exception 'ITEM_PAGE_TIE_UNSTABLE: %, %, %', v_page_2, v_page_2_repeat, v_page_3;
  end if;
end $$;

-- Round 2 fixtures: every canonical charge must have an accepted item category,
-- and visit-level alert/correction values must survive category projection.
alter table public.queue_entries disable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations disable trigger capture_financial_visit_completion_from_consultation;
insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-02 16:30:00+00', null),
  ('50000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-02 17:30:00+00', null),
  ('50000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'completed', 'cash', null, '2026-08-02 18:30:00+00', null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('60000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000081', '60000000-0000-4000-8000-000000000008', 'Mixed-margin medicine', '80000000-0000-4000-8000-000000000081', null, null, 1, 1, 100, 20, null, null, null),
  ('70000000-0000-4000-8000-000000000082', '60000000-0000-4000-8000-000000000008', 'Mixed-margin procedure', null, '81000000-0000-4000-8000-000000000082', null, 1, null, 10, 100, null, null, null),
  ('70000000-0000-4000-8000-000000000181', '60000000-0000-4000-8000-000000000009', 'Corrected procedure first', null, '81000000-0000-4000-8000-000000000181', null, 1, null, 20, 5, null, null, null),
  ('70000000-0000-4000-8000-000000000092', '60000000-0000-4000-8000-000000000009', 'Corrected medicine second', '80000000-0000-4000-8000-000000000092', null, null, 1, 1, 30, 5, null, null, null),
  ('70000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000010', 'Completion administration', null, null, null, 1, null, 40, 0, 'other_charge', null, '83000000-0000-4000-8000-000000000001');
insert into private.financial_visit_completion_events
  (queue_entry_id, consultation_id, completed_at, provenance, attribution_complete, item_state)
select fixture.queue_entry_id, fixture.consultation_id, fixture.completed_at,
  'recorded', true,
  private.financial_control_completion_item_state(fixture.consultation_id)
from (values
  ('50000000-0000-4000-8000-000000000008'::uuid, '60000000-0000-4000-8000-000000000008'::uuid, '2026-08-02 17:00:00+00'::timestamptz),
  ('50000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000009', '2026-08-02 18:00:00+00'),
  ('50000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000010', '2026-08-02 19:00:00+00')
) fixture(queue_entry_id, consultation_id, completed_at);
insert into public.completed_bill_correction_audit
select
  'b0000000-0000-4000-8000-000000000181',
  '50000000-0000-4000-8000-000000000009',
  '60000000-0000-4000-8000-000000000009',
  public.completed_bill_correction_state(
    '50000000-0000-4000-8000-000000000009',
    '60000000-0000-4000-8000-000000000009'
  ),
  public.completed_bill_correction_state(
    '50000000-0000-4000-8000-000000000009',
    '60000000-0000-4000-8000-000000000009'
  ),
  '2026-08-03 10:00:00+00';
insert into public.completed_bill_correction_audit
select
  'b0000000-0000-4000-8000-000000000101',
  '50000000-0000-4000-8000-000000000010',
  '60000000-0000-4000-8000-000000000010',
  public.completed_bill_correction_state(
    '50000000-0000-4000-8000-000000000010',
    '60000000-0000-4000-8000-000000000010'
  ),
  '{"total": 0, "discount_rm": 0, "tax_rm": 0, "paid": 0, "items": []}'::jsonb,
  '2026-08-04 01:00:00+00';
update public.consultation_items
set item_name = 'Mutated and deleted administration',
    price = 400,
    clinic_charge_type_id = '83000000-0000-4000-8000-000000000002',
    deleted_at = '2026-08-04 01:00:00+00'
where id = '70000000-0000-4000-8000-000000000101';
alter table public.queue_entries enable trigger capture_financial_visit_completion_from_queue;
alter table public.consultations enable trigger capture_financial_visit_completion_from_consultation;

do $$
declare
  v_details jsonb;
  v_visit_billed numeric;
  v_item_billed numeric := 0;
  v_negative_amount numeric := 0;
begin
  v_details := public.get_financial_control_details(
    '2026-08-03', '2026-08-03', '2026-08-03',
    'billed_revenue', 'visit', null, 1, 100
  );
  select coalesce(sum((row_value->>'billed')::numeric), 0)
    into v_visit_billed
  from jsonb_array_elements(v_details->'rows') row_value
  where (row_value->>'attributionComplete')::boolean;

  foreach v_details in array array[
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'billed_revenue', 'medicine', null, 1, 100),
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'billed_revenue', 'procedure', null, 1, 100),
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'billed_revenue', 'package', null, 1, 100)
  ] loop
    v_item_billed := v_item_billed + coalesce((
      select sum((row_value->>'billed')::numeric)
      from jsonb_array_elements(v_details->'rows') row_value
      where (row_value->>'attributionComplete')::boolean
    ), 0);
  end loop;
  if abs(v_visit_billed - 300) > 0.01
     or abs(v_item_billed - v_visit_billed) > 0.01 then
    raise exception 'GENERIC_ITEM_RECONCILIATION_MISMATCH: visit %, items %',
      v_visit_billed, v_item_billed;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-03', '2026-08-03', '2026-08-03',
    'billed_revenue', 'procedure', null, 1, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'groupKey' = 'charge_type:83000000-0000-4000-8000-000000000001'
      and row_value->>'groupLabel' = 'Completion administration'
      and (row_value->>'billed')::numeric = 40
  ) then
    raise exception 'GENERIC_CHARGE_HISTORY_MISMATCH: %', v_details;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-03', '2026-08-03', '2026-08-03',
    'alerts', 'visit', 'negative_margin', 1, 100
  );
  if (v_details #>> '{rows,0,amount}')::numeric <> 10 then
    raise exception 'CANONICAL_NEGATIVE_MARGIN_VISIT_MISMATCH: %', v_details;
  end if;
  foreach v_details in array array[
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'alerts', 'medicine', 'negative_margin', 1, 100),
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'alerts', 'procedure', 'negative_margin', 1, 100),
    public.get_financial_control_details('2026-08-03', '2026-08-03', '2026-08-03', 'alerts', 'package', 'negative_margin', 1, 100)
  ] loop
    v_negative_amount := v_negative_amount + coalesce((
      select sum((row_value->>'amount')::numeric)
      from jsonb_array_elements(v_details->'rows') row_value
      where (row_value->>'attributionComplete')::boolean
    ), 0);
  end loop;
  if abs(v_negative_amount - 10) > 0.01 then
    raise exception 'ITEM_NEGATIVE_MARGIN_ALLOCATION_MISMATCH: %', v_negative_amount;
  end if;

  v_details := public.get_financial_control_details(
    '2026-08-03', '2026-08-03', '2026-08-03',
    'alerts', 'medicine', 'refund_void_correction', 1, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'groupKey' = '80000000-0000-4000-8000-000000000092'
      and (row_value->>'corrections')::integer = 1
      and (row_value->'alertKeys') ? 'refund_void_correction'
  ) then
    raise exception 'MEDICINE_CORRECTION_COUNT_LOST: %', v_details;
  end if;
  v_details := public.get_financial_control_details(
    '2026-08-03', '2026-08-03', '2026-08-03',
    'alerts', 'procedure', 'refund_void_correction', 1, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_details->'rows') row_value
    where row_value->>'groupKey' = '81000000-0000-4000-8000-000000000181'
      and (row_value->>'corrections')::integer = 1
      and (row_value->'alertKeys') ? 'refund_void_correction'
  ) then
    raise exception 'PROCEDURE_CORRECTION_COUNT_LOST: %', v_details;
  end if;
end $$;

-- Association transfers must move immutable payment and panel state whether the
-- affected visits complete before or after the reassignment.
insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000090', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000092', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000093', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000090', '50000000-0000-4000-8000-000000000090', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000091', '50000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000092', '50000000-0000-4000-8000-000000000092', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000093', '50000000-0000-4000-8000-000000000093', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000190', '60000000-0000-4000-8000-000000000090', 'Pre-transfer origin', null, '81000000-0000-4000-8000-000000000190', null, 1, null, 100, 10, null, null, null),
  ('70000000-0000-4000-8000-000000000191', '60000000-0000-4000-8000-000000000091', 'Pre-transfer destination', null, '81000000-0000-4000-8000-000000000191', null, 1, null, 100, 10, null, null, null),
  ('70000000-0000-4000-8000-000000000192', '60000000-0000-4000-8000-000000000092', 'Post-transfer origin', null, '81000000-0000-4000-8000-000000000192', null, 1, null, 100, 10, null, null, null),
  ('70000000-0000-4000-8000-000000000193', '60000000-0000-4000-8000-000000000093', 'Post-transfer destination', null, '81000000-0000-4000-8000-000000000193', null, 1, null, 100, 10, null, null, null);

insert into public.payments values
  ('90000000-0000-4000-8000-000000000090', '50000000-0000-4000-8000-000000000090', '60000000-0000-4000-8000-000000000090', 'self_pay', 'cash', 25, statement_timestamp(), null);
insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000090', '50000000-0000-4000-8000-000000000090', '40000000-0000-4000-8000-000000000001', 80, 30, 'submitted', statement_timestamp(), statement_timestamp(), null);
update public.payments
set queue_entry_id = '50000000-0000-4000-8000-000000000091',
    consultation_id = '60000000-0000-4000-8000-000000000091'
where id = '90000000-0000-4000-8000-000000000090';
update public.panel_claims
set queue_entry_id = '50000000-0000-4000-8000-000000000091'
where id = 'a0000000-0000-4000-8000-000000000090';

update public.queue_entries
set clinic_status = 'completed'
where id in (
  '50000000-0000-4000-8000-000000000090',
  '50000000-0000-4000-8000-000000000091',
  '50000000-0000-4000-8000-000000000092',
  '50000000-0000-4000-8000-000000000093'
);
update public.consultations
set status = 'completed'
where id in (
  '60000000-0000-4000-8000-000000000090',
  '60000000-0000-4000-8000-000000000091',
  '60000000-0000-4000-8000-000000000092',
  '60000000-0000-4000-8000-000000000093'
);

insert into public.payments values
  ('90000000-0000-4000-8000-000000000092', '50000000-0000-4000-8000-000000000092', '60000000-0000-4000-8000-000000000092', 'self_pay', 'cash', 40, statement_timestamp(), null);
insert into public.panel_claims values
  ('a0000000-0000-4000-8000-000000000092', '50000000-0000-4000-8000-000000000092', '40000000-0000-4000-8000-000000000001', 90, 35, 'approved', statement_timestamp(), statement_timestamp(), null);
update public.payments
set queue_entry_id = '50000000-0000-4000-8000-000000000093',
    consultation_id = '60000000-0000-4000-8000-000000000093'
where id = '90000000-0000-4000-8000-000000000092';
update public.panel_claims
set queue_entry_id = '50000000-0000-4000-8000-000000000093'
where id = 'a0000000-0000-4000-8000-000000000092';

do $$
declare
  v_row record;
  v_report_date date := (timezone('Asia/Kuala_Lumpur', statement_timestamp()))::date;
begin
  if (select count(*) from private.financial_payment_events event
      where event.payment_id = '90000000-0000-4000-8000-000000000090'
        and event.event_kind = 'reassignment_out') <> 1
     or (select count(*) from private.financial_payment_events event
      where event.payment_id = '90000000-0000-4000-8000-000000000090'
        and event.event_kind = 'reassignment_in') <> 1 then
    raise exception 'PAYMENT_PRE_COMPLETION_REASSIGNMENT_EVENTS_MISSING';
  end if;
  if (select count(*) from private.financial_payment_events event
      where event.payment_id = '90000000-0000-4000-8000-000000000092'
        and event.event_kind = 'reassignment_out') <> 1
     or (select count(*) from private.financial_payment_events event
      where event.payment_id = '90000000-0000-4000-8000-000000000092'
        and event.event_kind = 'reassignment_in') <> 1 then
    raise exception 'PAYMENT_POST_COMPLETION_REASSIGNMENT_EVENTS_MISSING';
  end if;
  if (select count(*) from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000090'
        and event.event_kind = 'reassignment_out') <> 1
     or (select count(*) from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000090'
        and event.event_kind = 'reassignment_in') <> 1 then
    raise exception 'PANEL_PRE_COMPLETION_REASSIGNMENT_EVENTS_MISSING';
  end if;
  if (select count(*) from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000092'
        and event.event_kind = 'reassignment_out') <> 1
     or (select count(*) from private.financial_panel_claim_events event
      where event.panel_claim_id = 'a0000000-0000-4000-8000-000000000092'
        and event.event_kind = 'reassignment_in') <> 1 then
    raise exception 'PANEL_POST_COMPLETION_REASSIGNMENT_EVENTS_MISSING';
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts(v_report_date, v_report_date, v_report_date)
  where queue_entry_id = '50000000-0000-4000-8000-000000000090';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (0::numeric, 0::numeric, 0::numeric) then
    raise exception 'PRE_COMPLETION_REASSIGNMENT_OLD_STATE_REMAINS: %', row_to_json(v_row);
  end if;
  select * into strict v_row
  from private.financial_control_visit_facts(v_report_date, v_report_date, v_report_date)
  where queue_entry_id = '50000000-0000-4000-8000-000000000091';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (55::numeric, 55::numeric, 50::numeric) then
    raise exception 'PRE_COMPLETION_REASSIGNMENT_NEW_STATE_MISSING: %', row_to_json(v_row);
  end if;
  select * into strict v_row
  from private.financial_control_visit_facts(v_report_date, v_report_date, v_report_date)
  where queue_entry_id = '50000000-0000-4000-8000-000000000092';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (0::numeric, 0::numeric, 0::numeric) then
    raise exception 'POST_COMPLETION_REASSIGNMENT_OLD_STATE_REMAINS: %', row_to_json(v_row);
  end if;
  select * into strict v_row
  from private.financial_control_visit_facts(v_report_date, v_report_date, v_report_date)
  where queue_entry_id = '50000000-0000-4000-8000-000000000093';
  if (v_row.paid_to_date, v_row.paid_in_period, v_row.panel_outstanding)
     is distinct from (75::numeric, 75::numeric, 55::numeric) then
    raise exception 'POST_COMPLETION_REASSIGNMENT_NEW_STATE_MISSING: %', row_to_json(v_row);
  end if;
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
  ('70000000-0000-4000-8000-000000000095', '60000000-0000-4000-8000-000000000095', 'Trigger package', null, null, '82000000-0000-4000-8000-000000000095', 1, null, 50, 20, null, null, null),
  ('70000000-0000-4000-8000-000000000094', '60000000-0000-4000-8000-000000000095', 'Trigger included medicine', '80000000-0000-4000-8000-000000000095', null, null, 1, 1, 0, 0, null, null, null);
insert into public.package_items values
  ('c0000000-0000-4000-8000-000000000095', '82000000-0000-4000-8000-000000000095', '80000000-0000-4000-8000-000000000095', null);
update public.queue_entries
set clinic_status = 'completed'
where id = '50000000-0000-4000-8000-000000000095';
update public.consultations
set status = 'completed'
where id = '60000000-0000-4000-8000-000000000095';
update public.consultations
set status = 'in_progress'
where id = '60000000-0000-4000-8000-000000000095';
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
  if (select count(*)
      from private.financial_visit_completion_events event
      where event.consultation_id = '60000000-0000-4000-8000-000000000095'
        and event.event_kind = 'completion') <> 2
     or (select count(*)
      from private.financial_visit_completion_events event
      where event.consultation_id = '60000000-0000-4000-8000-000000000095'
        and event.event_kind = 'void') <> 1 then
    raise exception 'COMPLETION_LIFECYCLE_TRIGGER_MISMATCH';
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
     or has_function_privilege('public', 'private.financial_control_visit_facts(date,date,date)', 'execute')
     or has_function_privilege('anon', 'private.financial_control_completion_item_state(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.financial_control_completion_item_state(uuid)', 'execute')
     or has_function_privilege('public', 'private.financial_control_completion_item_state(uuid)', 'execute')
     or has_function_privilege('anon', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute')
     or has_function_privilege('authenticated', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute')
     or has_function_privilege('public', 'private.financial_control_bill_state_as_of(uuid,uuid,date)', 'execute') then
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

        writeFileSync(portionBootstrapPath, `
create role service_role nologin;
create type public.panel_claim_status as enum (
  'pending', 'submitted', 'approved', 'rejected', 'received', 'cancelled'
);
alter table public.panel_claims
  alter column status type public.panel_claim_status
  using status::public.panel_claim_status;

create table public.profiles (id uuid primary key);
create table public.user_roles (
  user_id uuid not null references public.profiles(id),
  role text not null
);
insert into public.profiles values ('10000000-0000-4000-8000-000000000001');
insert into public.user_roles values (
  '10000000-0000-4000-8000-000000000001',
  'admin'
);

alter table public.panel_claims
  add column payment_reference text,
  add column received_date date,
  add column updated_by uuid references public.profiles(id),
  add column claim_date date,
  add column submitted_date date,
  add column approved_amount numeric,
  add column write_off_amount numeric generated always as (amount - coalesce(approved_amount, amount)) stored,
  add column gl_document_url text,
  add column remarks text,
  add column claim_no text,
  add column patient_id uuid;
update public.panel_claims set claim_date = date '2000-01-01';
alter table public.panel_claims alter column claim_date set default current_date;
alter table public.panel_claims alter column id set default gen_random_uuid();
create unique index panel_claims_queue_entry_unique_idx
  on public.panel_claims (queue_entry_id);

alter table public.consultation_items alter column id set default gen_random_uuid();
alter table public.payments alter column id set default gen_random_uuid();
alter table public.payments alter column created_at set default now();

create table public.completed_bill_correction_guard (
  consultation_id uuid primary key,
  queue_entry_id uuid not null,
  actor_id uuid not null references public.profiles(id)
);
revoke all on public.completed_bill_correction_guard from public, anon, authenticated;

alter table public.user_roles enable row level security;
create policy user_roles_own_read on public.user_roles
  for select to authenticated using (user_id = auth.uid());
grant select on public.user_roles to authenticated;
alter table public.panel_claims enable row level security;
grant select, update on public.panel_claims to authenticated;

alter table public.insurance_providers
  add column status text not null default 'active',
  add column consultation_fee_override numeric;
create table public.inventory_items (id uuid primary key);
create table public.inventory_item_batches (
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity_remaining numeric not null,
  expiry_date date not null
);

create or replace function public.ensure_panel_claim_for_queue(p_queue_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claim_id uuid;
  v_panel_id uuid;
  v_patient_id uuid;
  v_amount numeric;
begin
  select queue_entry.panel_id, queue_entry.patient_id
    into v_panel_id, v_patient_id
  from public.queue_entries as queue_entry
  where queue_entry.id = p_queue_entry_id
    and queue_entry.payment_method = 'panel';
  if not found then return null; end if;

  select coalesce(sum(item.price * item.quantity), 0)
    into v_amount
  from public.consultations as consultation
  left join public.consultation_items as item
    on item.consultation_id = consultation.id and item.deleted_at is null
  where consultation.queue_entry_id = p_queue_entry_id
    and consultation.deleted_at is null;

  select claim.id into v_claim_id
  from public.panel_claims as claim
  where claim.queue_entry_id = p_queue_entry_id
  for update;
  if found then
    update public.panel_claims as claim
    set amount = v_amount
    where claim.id = v_claim_id and claim.status = 'pending';
    return v_claim_id;
  end if;

  insert into public.panel_claims (
    queue_entry_id, panel_id, patient_id, claim_no, amount, received_amount,
    status, created_at, updated_at, due_date, claim_date
  ) values (
    p_queue_entry_id, v_panel_id, v_patient_id, 'RUNTIME-' || p_queue_entry_id::text,
    v_amount, 0, 'pending', now(), now(), current_date + 30, current_date
  ) returning id into v_claim_id;
  return v_claim_id;
end
$$;

create or replace function public.is_staff_or_admin(user_id uuid)
returns boolean
language sql
stable
as $$ select user_id is not null $$;

create or replace function public.can_checkout_visit(user_id uuid)
returns boolean
language sql
stable
as $$ select user_id is not null $$;

create or replace function public.is_finance_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = auth.uid()
      and user_role.role in ('operations', 'ops_staff', 'doctor_admin', 'admin', 'special_admin')
  )
$$;

create policy panel_claims_finance_admin_read on public.panel_claims
  for select to authenticated using (public.is_finance_admin());
create policy panel_claims_ops_insert on public.panel_claims
  for insert to authenticated with check (true);
create policy panel_claims_ops_update on public.panel_claims
  for update to authenticated using (true) with check (true);
create policy panel_claims_ops_delete on public.panel_claims
  for delete to authenticated using (true);

create or replace function public.lock_completed_bill_item_mutation_boundary()
returns void
language sql
as $$ select null::void $$;

create function public.checkout_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_total_amount numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_type text default 'self_pay',
  p_panel_provider_id uuid default null,
  p_other_charges jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language sql
as $$ select '{}'::jsonb $$;
`, 'utf8');

        writeFileSync(splitFixturePath, `
alter table public.panel_claim_portion_receipts
  disable trigger panel_claim_portion_receipts_append_only;
alter table public.panel_claim_portion_audit
  disable trigger panel_claim_portion_audit_append_only;
truncate table
  private.financial_zero_price_package_child_events,
  private.financial_panel_claim_events,
  private.financial_payment_events,
  private.financial_visit_completion_events,
  public.panel_claim_portion_receipts,
  public.panel_claim_portions,
  public.panel_claims,
  public.payments,
  public.consultation_items,
  public.consultations,
  public.queue_entries
restart identity cascade;
alter table public.panel_claim_portion_receipts
  enable trigger panel_claim_portion_receipts_append_only;
alter table public.panel_claim_portion_audit
  enable trigger panel_claim_portion_audit_append_only;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  false
);

insert into public.queue_entries values
  ('50000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000205', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('50000000-0000-4000-8000-000000000206', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null);
insert into public.consultations values
  ('60000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000204', '50000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000205', '50000000-0000-4000-8000-000000000205', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('60000000-0000-4000-8000-000000000206', '50000000-0000-4000-8000-000000000206', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null);
insert into public.consultation_items values
  ('70000000-0000-4000-8000-000000000201', '60000000-0000-4000-8000-000000000201', 'Partial split', null, '81000000-0000-4000-8000-000000000201', null, 1, null, 400, 0, null, null, '83000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000202', '60000000-0000-4000-8000-000000000202', 'Fully paid split', null, '81000000-0000-4000-8000-000000000202', null, 1, null, 300, 0, null, null, '83000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000203', '60000000-0000-4000-8000-000000000203', 'Historical unsplit', null, '81000000-0000-4000-8000-000000000203', null, 1, null, 200, 0, null, null, '83000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000204', '60000000-0000-4000-8000-000000000204', 'Reassigned split origin', null, '81000000-0000-4000-8000-000000000204', null, 1, null, 400, 0, null, null, '83000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000205', '60000000-0000-4000-8000-000000000205', 'Reassigned split destination', null, '81000000-0000-4000-8000-000000000205', null, 1, null, 400, 0, null, null, '83000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000206', '60000000-0000-4000-8000-000000000206', 'Terminal split', null, '81000000-0000-4000-8000-000000000206', null, 1, null, 100, 0, null, null, '83000000-0000-4000-8000-000000000001');

insert into public.panel_claims (
  id, queue_entry_id, panel_id, amount, received_amount, status,
  created_at, updated_at, due_date, claim_date, submitted_date
) values
  ('a0000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000001', 400, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30, current_date + 1, current_date + 1),
  ('a0000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-000000000001', 300, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30, current_date + 1, current_date + 1),
  ('a0000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000203', '40000000-0000-4000-8000-000000000001', 200, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30, current_date + 1, null),
  ('a0000000-0000-4000-8000-000000000204', '50000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000001', 400, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30, current_date + 10, current_date + 10),
  ('a0000000-0000-4000-8000-000000000205', '50000000-0000-4000-8000-000000000206', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30, current_date + 20, current_date + 20);

select public.replace_panel_claim_portions(
  'a0000000-0000-4000-8000-000000000201',
  '[{"amount":150,"remark":"first"},{"amount":250,"remark":"second"}]'::jsonb,
  'financial fixture partial split',
  0
);
select public.replace_panel_claim_portions(
  'a0000000-0000-4000-8000-000000000202',
  '[{"amount":100,"remark":"first"},{"amount":200,"remark":"second"}]'::jsonb,
  'financial fixture paid split',
  0
);
select public.replace_panel_claim_portions(
  'a0000000-0000-4000-8000-000000000204',
  '[{"amount":150,"remark":"original queue"},{"amount":250,"remark":"outstanding"}]'::jsonb,
  'financial fixture reassigned split',
  0
);
select public.replace_panel_claim_portions(
  'a0000000-0000-4000-8000-000000000205',
  '[{"amount":40,"remark":"terminal one"},{"amount":60,"remark":"terminal two"}]'::jsonb,
  'financial fixture terminal split',
  0
);

select public.record_panel_claim_portion_payment(
  (select id from public.panel_claim_portions where panel_claim_id = 'a0000000-0000-4000-8000-000000000201' and portion_no = 1),
  150, current_date + 1, 'PARTIAL-150', null,
  'd0000000-0000-4000-8000-000000000201'
);
select public.record_panel_claim_portion_payment(
  (select id from public.panel_claim_portions where panel_claim_id = 'a0000000-0000-4000-8000-000000000202' and portion_no = 1),
  100, current_date + 1, 'PAID-100', null,
  'd0000000-0000-4000-8000-000000000202'
);
select public.record_panel_claim_portion_payment(
  (select id from public.panel_claim_portions where panel_claim_id = 'a0000000-0000-4000-8000-000000000202' and portion_no = 2),
  200, current_date + 1, 'PAID-200', null,
  'd0000000-0000-4000-8000-000000000203'
);
select public.record_panel_claim_portion_payment(
  (select id from public.panel_claim_portions where panel_claim_id = 'a0000000-0000-4000-8000-000000000204' and portion_no = 1),
  150, current_date + 10, 'REASSIGNED-150', null,
  'd0000000-0000-4000-8000-000000000204'
);
update public.panel_claims
set queue_entry_id = '50000000-0000-4000-8000-000000000205',
    updated_by = '10000000-0000-4000-8000-000000000001'
where id = 'a0000000-0000-4000-8000-000000000204';

alter table private.financial_panel_claim_events
  disable trigger prevent_financial_panel_claim_event_change;
update private.financial_panel_claim_events
set occurred_at = (current_date + 11)::timestamp at time zone 'Asia/Kuala_Lumpur'
where panel_claim_id = 'a0000000-0000-4000-8000-000000000204'
  and event_kind in ('reassignment_out', 'reassignment_in');
alter table private.financial_panel_claim_events
  enable trigger prevent_financial_panel_claim_event_change;
update public.panel_claims
set received_amount = 50,
    status = 'submitted',
    received_date = current_date + 1,
    updated_by = '10000000-0000-4000-8000-000000000001'
where id = 'a0000000-0000-4000-8000-000000000203';

update public.queue_entries
set clinic_status = 'completed'
where id in (
  '50000000-0000-4000-8000-000000000201',
  '50000000-0000-4000-8000-000000000202',
  '50000000-0000-4000-8000-000000000203'
);
update public.consultations
set status = 'completed'
where id in (
  '60000000-0000-4000-8000-000000000201',
  '60000000-0000-4000-8000-000000000202',
  '60000000-0000-4000-8000-000000000203'
);

insert into private.financial_visit_completion_events (
  queue_entry_id, consultation_id, event_kind, completed_at,
  provenance, attribution_complete, item_state
)
select fixture.queue_entry_id, fixture.consultation_id, 'completion',
  (current_date + 1)::timestamp at time zone 'Asia/Kuala_Lumpur',
  'recorded', true,
  private.financial_control_completion_item_state(fixture.consultation_id)
from (values
  ('50000000-0000-4000-8000-000000000201'::uuid, '60000000-0000-4000-8000-000000000201'::uuid),
  ('50000000-0000-4000-8000-000000000202'::uuid, '60000000-0000-4000-8000-000000000202'::uuid),
  ('50000000-0000-4000-8000-000000000203'::uuid, '60000000-0000-4000-8000-000000000203'::uuid)
) fixture(queue_entry_id, consultation_id);

insert into private.financial_visit_completion_events (
  queue_entry_id, consultation_id, event_kind, completed_at,
  provenance, attribution_complete, item_state
)
select fixture.queue_entry_id, fixture.consultation_id, 'completion',
  fixture.completed_date::timestamp at time zone 'Asia/Kuala_Lumpur',
  'recorded', true,
  private.financial_control_completion_item_state(fixture.consultation_id)
from (values
  ('50000000-0000-4000-8000-000000000204'::uuid, '60000000-0000-4000-8000-000000000204'::uuid, current_date + 10),
  ('50000000-0000-4000-8000-000000000205'::uuid, '60000000-0000-4000-8000-000000000205'::uuid, current_date + 11),
  ('50000000-0000-4000-8000-000000000206'::uuid, '60000000-0000-4000-8000-000000000206'::uuid, current_date + 20)
) fixture(queue_entry_id, consultation_id, completed_date);

insert into private.financial_panel_claim_events (
  panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
  received_amount, receipt_delta, status, due_date, occurred_at,
  provenance, attribution_complete
) values (
  'a0000000-0000-4000-8000-000000000203',
  '50000000-0000-4000-8000-000000000203',
  '40000000-0000-4000-8000-000000000001',
  'receipt', 200, 50, 50, 'submitted', current_date + 30,
  (current_date + 1)::timestamp at time zone 'Asia/Kuala_Lumpur',
  'recorded', true
);

do $$
declare
  v_row record;
  v_summary jsonb;
  v_details jsonb;
  v_health jsonb;
begin
  select * into strict v_row
  from private.financial_control_visit_facts(current_date + 1, current_date + 1, current_date + 1)
  where queue_entry_id = '50000000-0000-4000-8000-000000000201';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (400::numeric, 150::numeric, 150::numeric, 250::numeric, 250::numeric) then
    raise exception 'PARTIAL_SPLIT_RECONCILIATION_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts(current_date + 1, current_date + 1, current_date + 1)
  where queue_entry_id = '50000000-0000-4000-8000-000000000202';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (300::numeric, 300::numeric, 300::numeric, 0::numeric, 0::numeric) then
    raise exception 'PAID_SPLIT_RECONCILIATION_MISMATCH: %', row_to_json(v_row);
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts(current_date + 1, current_date + 1, current_date + 1)
  where queue_entry_id = '50000000-0000-4000-8000-000000000203';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (200::numeric, 50::numeric, 50::numeric, 150::numeric, 150::numeric) then
    raise exception 'UNSPLIT_RECONCILIATION_CHANGED: %', row_to_json(v_row);
  end if;

  if (select received_amount from public.panel_claims
      where id = 'a0000000-0000-4000-8000-000000000201') <> 150 then
    raise exception 'PARTIAL_SPLIT_PARENT_RECEIVED_MISMATCH';
  end if;
  if (select count(*) from private.financial_panel_claim_events
      where panel_claim_id = 'a0000000-0000-4000-8000-000000000201'
        and event_kind = 'receipt' and receipt_delta = 150) <> 1 then
    raise exception 'PARTIAL_SPLIT_RECEIPT_EVENT_DUPLICATED';
  end if;
  if (select count(*) from private.financial_panel_claim_events
      where panel_claim_id = 'a0000000-0000-4000-8000-000000000201'
        and event_kind = 'claim_created') <> 1 then
    raise exception 'PARTIAL_SPLIT_BILLED_EVENT_DUPLICATED';
  end if;

  v_summary := public.get_financial_control_summary(
    current_date + 1, current_date + 1, current_date, current_date, current_date + 1
  );
  if (v_summary #>> '{period,billedRevenue}',
      v_summary #>> '{period,cashCollected}',
      v_summary #>> '{period,totalOutstanding}',
      v_summary #>> '{period,completedVisits}')
     is distinct from ('900.00', '500.00', '400.00', '3') then
    raise exception 'SPLIT_SUMMARY_TOTALS_MISMATCH: %', v_summary;
  end if;
  if not (v_summary ?& array['period', 'comparison', 'reconciliation', 'alerts', 'generated_at']) then
    raise exception 'FINANCIAL_SUMMARY_SHAPE_CHANGED: %', v_summary;
  end if;

  v_details := public.get_financial_control_details(
    current_date + 1, current_date + 1, current_date + 1,
    'billed_revenue', 'visit', null, 1, 100
  );
  if (v_details->>'total')::integer <> 3
     or not (v_details ?& array['rows', 'total', 'page', 'pageSize', 'totals']) then
    raise exception 'FINANCIAL_DETAILS_SHAPE_OR_COUNT_CHANGED: %', v_details;
  end if;

  v_health := public.get_clinic_health_metrics(current_date + 1, current_date + 1);
  if (v_health #>> '{claims,outstandingAmount}',
      v_health #>> '{claims,unsubmittedCount}')
     is distinct from ('400.00', '1') then
    raise exception 'CLINIC_HEALTH_SPLIT_TOTALS_MISMATCH: %', v_health;
  end if;

  if (select count(*) from private.financial_panel_claim_events
      where panel_claim_id = 'a0000000-0000-4000-8000-000000000204'
        and event_kind = 'receipt'
        and queue_entry_id = '50000000-0000-4000-8000-000000000204'
        and receipt_delta = 150) <> 1 then
    raise exception 'REASSIGNED_CHILD_RECEIPT_CONTEXT_MISSING';
  end if;
  if exists (
    select 1 from private.financial_panel_claim_events
    where panel_claim_id = 'a0000000-0000-4000-8000-000000000204'
      and event_kind in ('reassignment_out', 'reassignment_in')
      and receipt_delta <> 0
  ) or exists (
    select 1 from private.financial_panel_claim_events
    where panel_claim_id = 'a0000000-0000-4000-8000-000000000204'
      and receipt_delta < 0
  ) then
    raise exception 'SPLIT_REASSIGNMENT_EMITTED_CASH_DELTA';
  end if;

  if (select coalesce(sum(paid_in_period), 0)
      from private.financial_control_visit_facts(
        current_date + 10, current_date + 10, current_date + 11
      )
      where queue_entry_id in (
        '50000000-0000-4000-8000-000000000204',
        '50000000-0000-4000-8000-000000000205'
      )) <> 150 then
    raise exception 'REASSIGNED_D1_CASH_NOT_EXACTLY_ONCE';
  end if;
  if (select coalesce(sum(paid_in_period), 0)
      from private.financial_control_visit_facts(
        current_date + 11, current_date + 11, current_date + 11
      )
      where queue_entry_id in (
        '50000000-0000-4000-8000-000000000204',
        '50000000-0000-4000-8000-000000000205'
      )) <> 0 then
    raise exception 'REASSIGNED_D2_CASH_NOT_ZERO';
  end if;

  select * into strict v_row
  from private.financial_control_visit_facts(
    current_date + 11, current_date + 11, current_date + 11
  )
  where queue_entry_id = '50000000-0000-4000-8000-000000000205';
  if (v_row.billed, v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (400::numeric, 150::numeric, 0::numeric, 250::numeric, 250::numeric) then
    raise exception 'REASSIGNED_CURRENT_VISIT_STATE_MISMATCH: %', row_to_json(v_row);
  end if;

  update public.panel_claims
  set status = 'rejected',
      updated_by = '10000000-0000-4000-8000-000000000001'
  where id = 'a0000000-0000-4000-8000-000000000205';
  select * into strict v_row
  from private.financial_control_visit_facts(
    current_date + 20, current_date + 20, current_date + 20
  )
  where queue_entry_id = '50000000-0000-4000-8000-000000000206';
  if (v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (0::numeric, 0::numeric, 0::numeric, 0::numeric) then
    raise exception 'REJECTED_SPLIT_STATE_MISMATCH: %', row_to_json(v_row);
  end if;

  set constraints all immediate;
  alter table public.panel_claims
    disable trigger guard_panel_claim_split_parent_mutation;
  update public.panel_claims
  set status = 'cancelled',
      updated_by = '10000000-0000-4000-8000-000000000001'
  where id = 'a0000000-0000-4000-8000-000000000205';
  alter table public.panel_claims
    enable trigger guard_panel_claim_split_parent_mutation;
  select * into strict v_row
  from private.financial_control_visit_facts(
    current_date + 20, current_date + 20, current_date + 20
  )
  where queue_entry_id = '50000000-0000-4000-8000-000000000206';
  if (v_row.paid_to_date, v_row.paid_in_period,
      v_row.outstanding, v_row.panel_outstanding)
     is distinct from (0::numeric, 0::numeric, 0::numeric, 0::numeric) then
    raise exception 'CANCELLED_SPLIT_STATE_MISMATCH: %', row_to_json(v_row);
  end if;
end $$;
`, 'utf8');

        writeFileSync(portionSecurityAssertionsPath, `
insert into public.profiles (id) values
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000007'),
  ('10000000-0000-4000-8000-000000000008'),
  ('10000000-0000-4000-8000-000000000009'),
  ('10000000-0000-4000-8000-000000000010');
insert into public.user_roles (user_id, role) values
  ('10000000-0000-4000-8000-000000000002', 'doctor_admin'),
  ('10000000-0000-4000-8000-000000000003', 'ops_staff'),
  ('10000000-0000-4000-8000-000000000004', 'operations'),
  ('10000000-0000-4000-8000-000000000005', 'purchaser'),
  ('10000000-0000-4000-8000-000000000006', 'resident_doctor'),
  ('10000000-0000-4000-8000-000000000007', 'locum'),
  ('10000000-0000-4000-8000-000000000008', 'staff_nurse'),
  ('10000000-0000-4000-8000-000000000009', 'guest');

insert into public.queue_entries (
  id, patient_id, clinic_status, payment_method, panel_id, created_at, deleted_at
) values
  ('51000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null),
  ('51000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000001', 'registered', 'panel', '40000000-0000-4000-8000-000000000001', statement_timestamp(), null);

insert into public.panel_claims (
  id, queue_entry_id, panel_id, amount, received_amount, status, created_at, updated_at, due_date
) values
  ('91000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30),
  ('91000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000001', 100, 0, 'pending', statement_timestamp(), statement_timestamp(), current_date + 30);

insert into public.consultations (
  id, queue_entry_id, patient_id, doctor_id, status, deleted_at
) values
  ('61000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('61000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('61000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('61000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'completed', null),
  ('61000000-0000-4000-8000-000000000010', '51000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('61000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('61000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('61000000-0000-4000-8000-000000000013', '51000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null),
  ('61000000-0000-4000-8000-000000000014', '51000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in_progress', null);

insert into public.consultation_items (
  id, consultation_id, item_name, quantity, price, deleted_at
) values
  ('71000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Paid correction guard', 1, 100, null),
  ('71000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', 'Correction growth', 1, 100, null),
  ('71000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000005', 'Rejected correction growth', 1, 100, null),
  ('71000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000010', 'Exact RM29.80 checkout', 1, 29.80, null),
  ('71000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000011', 'Rejected stale checkout total', 1, 29.80, null),
  ('71000000-0000-4000-8000-000000000012', '61000000-0000-4000-8000-000000000012', 'Materialized checkout claim', 1, 29.80, null);

insert into public.consultation_items (
  id, consultation_id, item_name, item_id, quantity, dispensed_qty, price, deleted_at
) values (
  '71000000-0000-4000-8000-000000000013',
  '61000000-0000-4000-8000-000000000013',
  'Partially dispensed medicine',
  '81000000-0000-4000-8000-000000000013',
  3, 2, 10, null
), (
  '71000000-0000-4000-8000-000000000014',
  '61000000-0000-4000-8000-000000000014',
  'Non-inventory procedure with stray dispense data',
  null,
  3, 1, 10, null
);

insert into public.panel_claims (
  id, queue_entry_id, panel_id, amount, received_amount, status, created_at,
  updated_at, due_date, submitted_date, approved_amount
) values (
  '91000000-0000-4000-8000-000000000012',
  '51000000-0000-4000-8000-000000000012',
  '40000000-0000-4000-8000-000000000001',
  25, 0, 'approved', statement_timestamp(), statement_timestamp(),
  current_date + 30, current_date, 25
);

set role authenticated;
do $allowed$
declare
  v_actor uuid;
  v_claim uuid;
begin
  for v_actor, v_claim in
    select * from (values
      ('10000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000001'::uuid),
      ('10000000-0000-4000-8000-000000000002'::uuid, '91000000-0000-4000-8000-000000000002'::uuid),
      ('10000000-0000-4000-8000-000000000003'::uuid, '91000000-0000-4000-8000-000000000003'::uuid),
      ('10000000-0000-4000-8000-000000000004'::uuid, '91000000-0000-4000-8000-000000000004'::uuid),
      ('10000000-0000-4000-8000-000000000005'::uuid, '91000000-0000-4000-8000-000000000005'::uuid)
    ) as allowed(actor_id, claim_id)
  loop
    perform set_config('request.jwt.claim.sub', v_actor::text, false);
    perform public.replace_panel_claim_portions(
      v_claim,
      '[{"amount":40,"remark":"runtime security first"},{"amount":60,"remark":"runtime security second"}]'::jsonb,
      'runtime authorization check',
      0
    );
  end loop;
end $allowed$;

do $denied$
declare
  v_actor uuid;
  v_claim uuid;
begin
  for v_actor, v_claim in
    select * from (values
      ('10000000-0000-4000-8000-000000000006'::uuid, '91000000-0000-4000-8000-000000000006'::uuid),
      ('10000000-0000-4000-8000-000000000007'::uuid, '91000000-0000-4000-8000-000000000007'::uuid),
      ('10000000-0000-4000-8000-000000000008'::uuid, '91000000-0000-4000-8000-000000000008'::uuid),
      ('10000000-0000-4000-8000-000000000009'::uuid, '91000000-0000-4000-8000-000000000009'::uuid)
    ) as denied(actor_id, claim_id)
  loop
    perform set_config('request.jwt.claim.sub', v_actor::text, false);
    begin
      perform public.replace_panel_claim_portions(
        v_claim,
        '[{"amount":40},{"amount":60}]'::jsonb,
        'runtime authorization denial check',
        0
      );
      raise exception 'UNAUTHORIZED_ROLE_WAS_ALLOWED: %', v_actor;
    exception when insufficient_privilege then
      if sqlerrm <> 'NOT_AUTHORIZED' then
        raise;
      end if;
    end;
  end loop;
end $denied$;

do $direct_mutation$
declare
  v_actor uuid;
begin
  for v_actor in
    select actor_id from (values
      ('10000000-0000-4000-8000-000000000001'::uuid),
      ('10000000-0000-4000-8000-000000000002'::uuid),
      ('10000000-0000-4000-8000-000000000003'::uuid),
      ('10000000-0000-4000-8000-000000000004'::uuid),
      ('10000000-0000-4000-8000-000000000005'::uuid),
      ('10000000-0000-4000-8000-000000000006'::uuid),
      ('10000000-0000-4000-8000-000000000007'::uuid),
      ('10000000-0000-4000-8000-000000000008'::uuid),
      ('10000000-0000-4000-8000-000000000009'::uuid)
    ) as authenticated_actor(actor_id)
  loop
    perform set_config('request.jwt.claim.sub', v_actor::text, false);
    begin
      insert into public.panel_claim_portions default values;
      raise exception 'DIRECT_PORTION_INSERT_WAS_ALLOWED: %', v_actor;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.panel_claim_portion_receipts default values;
      raise exception 'DIRECT_RECEIPT_INSERT_WAS_ALLOWED: %', v_actor;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.panel_claim_portion_audit default values;
      raise exception 'DIRECT_AUDIT_INSERT_WAS_ALLOWED: %', v_actor;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $direct_mutation$;
reset role;

select set_config(
  'task8.payment_portion_id',
  (select id::text from public.panel_claim_portions
   where panel_claim_id = '91000000-0000-4000-8000-000000000001' and portion_no = 1),
  false
);
set role authenticated;
do $payment_checks$
declare
  v_portion_id uuid;
begin
  if current_user <> 'authenticated' then
    raise exception 'PAYMENT_CHECK_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  v_portion_id := current_setting('task8.payment_portion_id')::uuid;

  perform public.record_panel_claim_portion_payment(
    v_portion_id, 40, current_date, 'RUNTIME-REPLAY', null,
    'd1000000-0000-4000-8000-000000000001'
  );
  perform public.record_panel_claim_portion_payment(
    v_portion_id, 40, current_date, 'RUNTIME-REPLAY', null,
    'd1000000-0000-4000-8000-000000000001'
  );
  begin
    perform public.record_panel_claim_portion_payment(
      v_portion_id, 0.01, current_date, 'RUNTIME-OVERPAY', null,
      'd1000000-0000-4000-8000-000000000002'
    );
    raise exception 'OVERPAYMENT_WAS_ALLOWED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PORTION_OVERPAYMENT' then
      raise;
    end if;
  end;
end $payment_checks$;
reset role;

alter role authenticated login;
create extension if not exists dblink;
select dblink_connect('portion_payment_first', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_connect('portion_payment_second', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_exec('portion_payment_first', format(
  'set task8.portion_id to %L',
  (select id::text from public.panel_claim_portions
   where panel_claim_id = '91000000-0000-4000-8000-000000000002' and portion_no = 1)
));
select dblink_exec('portion_payment_second', format(
  'set task8.portion_id to %L',
  (select id::text from public.panel_claim_portions
   where panel_claim_id = '91000000-0000-4000-8000-000000000002' and portion_no = 1)
));
select dblink_send_query('portion_payment_first', $query$
do $payment_first$
declare v_portion_id uuid;
begin
  if current_user <> 'authenticated' then
    raise exception 'FIRST_PAYMENT_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  v_portion_id := current_setting('task8.portion_id')::uuid;
  perform public.record_panel_claim_portion_payment(
    v_portion_id, 30, current_date, 'RUNTIME-CONCURRENT-FIRST', null,
    'd1000000-0000-4000-8000-000000000003'
  );
  perform pg_sleep(1);
end $payment_first$;
$query$);
select pg_sleep(0.2);
select dblink_exec('portion_payment_second', $query$
do $payment_second$
declare v_portion_id uuid;
begin
  if current_user <> 'authenticated' then
    raise exception 'SECOND_PAYMENT_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  v_portion_id := current_setting('task8.portion_id')::uuid;
  begin
    perform public.record_panel_claim_portion_payment(
      v_portion_id, 30, current_date, 'RUNTIME-CONCURRENT-SECOND', null,
      'd1000000-0000-4000-8000-000000000004'
    );
    raise exception 'CONCURRENT_OVERPAYMENT_WAS_ALLOWED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PORTION_OVERPAYMENT' then
      raise;
    end if;
  end;
end $payment_second$;
$query$);
select * from dblink_get_result('portion_payment_first') as result(status text);
select dblink_disconnect('portion_payment_first');
select dblink_disconnect('portion_payment_second');

select dblink_connect('split_payment_first', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_connect('split_payment_second', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_exec('split_payment_first', format(
  'set task8.portion_id to %L',
  (select id::text from public.panel_claim_portions
   where panel_claim_id = '91000000-0000-4000-8000-000000000003' and portion_no = 1)
));
select dblink_send_query('split_payment_first', $query$
do $split_payment_first$
declare v_portion_id uuid;
begin
  if current_user <> 'authenticated' then
    raise exception 'SPLIT_PAYMENT_FIRST_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  v_portion_id := current_setting('task8.portion_id')::uuid;
  perform public.record_panel_claim_portion_payment(
    v_portion_id, 40, current_date, 'RUNTIME-SPLIT-PAYMENT-FIRST', null,
    'd1000000-0000-4000-8000-000000000005'
  );
  perform pg_sleep(1);
end $split_payment_first$;
$query$);
select pg_sleep(0.2);
select dblink_exec('split_payment_second', $query$
do $split_payment_second$
begin
  if current_user <> 'authenticated' then
    raise exception 'SPLIT_PAYMENT_SECOND_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  begin
    perform public.replace_panel_claim_portions(
      '91000000-0000-4000-8000-000000000003',
      '[{"amount":50},{"amount":50}]'::jsonb,
      'concurrent split after payment',
      1
    );
    raise exception 'SPLIT_AFTER_PAYMENT_WAS_ALLOWED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'STALE_PANEL_CLAIM_PORTIONS' then
      raise;
    end if;
  end;
end $split_payment_second$;
$query$);
select * from dblink_get_result('split_payment_first') as result(status text);
select dblink_disconnect('split_payment_first');
select dblink_disconnect('split_payment_second');

select dblink_connect('split_split_first', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_connect('split_split_second', 'host=127.0.0.1 port=${port} dbname=postgres user=authenticated');
select dblink_send_query('split_split_first', $query$
do $split_split_first$
begin
  if current_user <> 'authenticated' then
    raise exception 'SPLIT_SPLIT_FIRST_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  perform public.replace_panel_claim_portions(
    '91000000-0000-4000-8000-000000000004',
    '[{"amount":30},{"amount":70}]'::jsonb,
    'first concurrent split replacement',
    1
  );
  perform pg_sleep(1);
end $split_split_first$;
$query$);
select pg_sleep(0.2);
select dblink_exec('split_split_second', $query$
do $split_split_second$
begin
  if current_user <> 'authenticated' then
    raise exception 'SPLIT_SPLIT_SECOND_SESSION_NOT_AUTHENTICATED';
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  begin
    perform public.replace_panel_claim_portions(
      '91000000-0000-4000-8000-000000000004',
      '[{"amount":20},{"amount":80}]'::jsonb,
      'second concurrent split replacement',
      1
    );
    raise exception 'STALE_SPLIT_REPLACEMENT_WAS_ALLOWED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'STALE_PANEL_CLAIM_PORTIONS' then raise; end if;
  end;
end $split_split_second$;
$query$);
select * from dblink_get_result('split_split_first') as result(status text);
select dblink_disconnect('split_split_first');
select dblink_disconnect('split_split_second');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', false);
do $purchaser_read_and_checkout$
declare
  v_first jsonb;
  v_replay jsonb;
  v_claim_id uuid;
begin
  if (select count(*) from public.panel_claims) < 1 then
    raise exception 'PURCHASER_PARENT_CLAIM_RLS_BLOCKED';
  end if;

  update public.panel_claims
  set remarks = 'Purchaser direct parent mutation'
  where id = '91000000-0000-4000-8000-000000000005';
  if found then
    raise exception 'PURCHASER_DIRECT_PARENT_MUTATION_WAS_ALLOWED';
  end if;

  begin
    perform public.update_panel_claim_workflow(
      '91000000-0000-4000-8000-000000000005',
      'submitted', current_date, null, null, null, null, null, null, null
    );
    raise exception 'PURCHASER_PARENT_WORKFLOW_MUTATION_WAS_ALLOWED';
  exception when insufficient_privilege then
    if sqlerrm <> 'NOT_AUTHORIZED' then raise; end if;
  end;

  v_first := public.checkout_visit(
    '51000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000010',
    29.80,
    0,
    'panel',
    'panel',
    '40000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    null,
    29.80,
    '[{"amount":9.90,"remark":"first"},{"amount":19.90,"remark":"second"}]'::jsonb,
    'd2000000-0000-4000-8000-000000000010'
  );
  v_replay := public.checkout_visit(
    '51000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000010',
    29.80,
    0,
    'panel',
    'panel',
    '40000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    null,
    29.80,
    '[{"amount":9.90,"remark":"first"},{"amount":19.90,"remark":"second"}]'::jsonb,
    'd2000000-0000-4000-8000-000000000010'
  );

  if v_first is distinct from v_replay then
    raise exception 'ATOMIC_CHECKOUT_REPLAY_CHANGED_RESULT';
  end if;
  v_claim_id := (v_first->>'panel_claim_id')::uuid;
  if (select amount from public.panel_claims where id = v_claim_id) <> 29.80
     or (select count(*) from public.panel_claim_portions
         where panel_claim_id = v_claim_id) <> 2
     or (select sum(amount) from public.panel_claim_portions
         where panel_claim_id = v_claim_id) <> 29.80 then
    raise exception 'AUTHORITATIVE_ATOMIC_CHECKOUT_STATE_MISMATCH';
  end if;

  perform public.checkout_visit(
    '51000000-0000-4000-8000-000000000013',
    '61000000-0000-4000-8000-000000000013',
    20,
    0,
    'panel',
    'panel',
    '40000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    null,
    20,
    null,
    'd2000000-0000-4000-8000-000000000013'
  );

  if (select amount from public.panel_claims
      where queue_entry_id = '51000000-0000-4000-8000-000000000013') <> 20 then
    raise exception 'PARTIAL_DISPENSE_CHECKOUT_BILLED_ORDERED_QUANTITY';
  end if;

  perform public.checkout_visit(
    '51000000-0000-4000-8000-000000000014',
    '61000000-0000-4000-8000-000000000014',
    30,
    0,
    'panel',
    'panel',
    '40000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    null,
    30,
    null,
    'd2000000-0000-4000-8000-000000000014'
  );

  if (select amount from public.panel_claims
      where queue_entry_id = '51000000-0000-4000-8000-000000000014') <> 30 then
    raise exception 'NON_INVENTORY_CHECKOUT_TRUSTED_STRAY_DISPENSE_QUANTITY';
  end if;

  begin
    perform public.checkout_visit(
      '51000000-0000-4000-8000-000000000011',
      '61000000-0000-4000-8000-000000000011',
      29.79,
      0,
      'panel',
      'panel',
      '40000000-0000-4000-8000-000000000001',
      '[]'::jsonb,
      null,
      29.79,
      null,
      'd2000000-0000-4000-8000-000000000011'
    );
    raise exception 'CALLER_CHECKOUT_TOTAL_WAS_TRUSTED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'CHECKOUT_TOTAL_MISMATCH' then raise; end if;
  end;

  begin
    perform public.checkout_visit(
      '51000000-0000-4000-8000-000000000012',
      '61000000-0000-4000-8000-000000000012',
      29.80,
      0,
      'panel',
      'panel',
      '40000000-0000-4000-8000-000000000001',
      '[]'::jsonb,
      null,
      29.80,
      null,
      'd2000000-0000-4000-8000-000000000012'
    );
    raise exception 'MATERIALIZED_CLAIM_WAS_OVERWRITTEN_BY_CHECKOUT';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PANEL_CLAIM_ALREADY_MATERIALIZED' then raise; end if;
  end;

end $purchaser_read_and_checkout$;

do $terminal_guards$
declare
  v_portion_id uuid;
  v_bulk_count integer;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  update public.panel_claims
  set status = case id
    when '91000000-0000-4000-8000-000000000007' then 'received'::public.panel_claim_status
    when '91000000-0000-4000-8000-000000000008' then 'rejected'::public.panel_claim_status
    else 'cancelled'::public.panel_claim_status
  end,
  received_amount = case
    when id = '91000000-0000-4000-8000-000000000007' then amount
    else received_amount
  end
  where id in (
    '91000000-0000-4000-8000-000000000007',
    '91000000-0000-4000-8000-000000000008',
    '91000000-0000-4000-8000-000000000009'
  );

  begin
    update public.panel_claims
    set status = 'pending'
    where id = '91000000-0000-4000-8000-000000000007';
    raise exception 'RECEIVED_UNSPLIT_CLAIM_WAS_RESURRECTED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'TERMINAL_PANEL_CLAIM_IMMUTABLE' then raise; end if;
  end;

  begin
    update public.panel_claims
    set status = 'pending'
    where id = '91000000-0000-4000-8000-000000000008';
    raise exception 'REJECTED_UNSPLIT_CLAIM_WAS_RESURRECTED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'TERMINAL_PANEL_CLAIM_IMMUTABLE' then raise; end if;
  end;

  begin
    update public.panel_claims
    set status = 'pending'
    where id = '91000000-0000-4000-8000-000000000009';
    raise exception 'CANCELLED_UNSPLIT_CLAIM_WAS_RESURRECTED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'TERMINAL_PANEL_CLAIM_IMMUTABLE' then raise; end if;
  end;

  v_bulk_count := public.bulk_submit_panel_claims(
    array[
      '91000000-0000-4000-8000-000000000006',
      '91000000-0000-4000-8000-000000000007',
      '91000000-0000-4000-8000-000000000008',
      '91000000-0000-4000-8000-000000000009'
    ]::uuid[],
    current_date
  );
  if v_bulk_count <> 1
     or (select status from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000006') <> 'submitted'
     or exists (
       select 1 from public.panel_claims
       where id in (
         '91000000-0000-4000-8000-000000000007',
         '91000000-0000-4000-8000-000000000008',
         '91000000-0000-4000-8000-000000000009'
       ) and status not in ('received', 'rejected', 'cancelled')
     ) then
    raise exception 'BULK_SUBMISSION_MUTATED_TERMINAL_CLAIM';
  end if;

  perform public.update_panel_claim_workflow(
    '91000000-0000-4000-8000-000000000005',
    'rejected', null, null, null, null, null,
    'Rejected by panel', null, null
  );
  select id into v_portion_id
  from public.panel_claim_portions
  where panel_claim_id = '91000000-0000-4000-8000-000000000005'
    and portion_no = 1;

  begin
    perform public.record_panel_claim_portion_payment(
      v_portion_id, 1, current_date, 'TERMINAL-RECEIPT', null,
      'd2000000-0000-4000-8000-000000000012'
    );
    raise exception 'REJECTED_SPLIT_ACCEPTED_RECEIPT';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PANEL_CLAIM_NOT_PAYABLE' then raise; end if;
  end;

  begin
    perform public.replace_panel_claim_portions(
      '91000000-0000-4000-8000-000000000005',
      '[{"amount":50},{"amount":50}]'::jsonb,
      'terminal replacement',
      2
    );
    raise exception 'REJECTED_SPLIT_WAS_REPLACED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PANEL_CLAIM_NOT_PAYABLE' then raise; end if;
  end;

  begin
    perform public.update_panel_claim_workflow(
      '91000000-0000-4000-8000-000000000005',
      'pending', null, null, null, null, null, null, null, null
    );
    raise exception 'REJECTED_SPLIT_WAS_RESURRECTED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'TERMINAL_PANEL_CLAIM_IMMUTABLE' then raise; end if;
  end;
end $terminal_guards$;

do $forged_correction_context$
begin
  perform set_config(
    'app.panel_claim_split_correction',
    '{"panel_claim_id":"91000000-0000-4000-8000-000000000004","actor_id":"10000000-0000-4000-8000-000000000001","reason":"forged"}',
    true
  );
  begin
    update public.panel_claims
    set amount = 110
    where id = '91000000-0000-4000-8000-000000000004';
    raise exception 'FORGED_CORRECTION_CONTEXT_WAS_ACCEPTED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'SPLIT_PARENT_AMOUNT_REQUIRES_CORRECTION' then raise; end if;
  end;
end $forged_correction_context$;
reset role;

do $checkout_storage_assertions$
begin
  if (select clinic_status from public.queue_entries
      where id = '51000000-0000-4000-8000-000000000010') <> 'completed'
     or (select count(*) from public.panel_claim_checkout_requests
         where idempotency_key = 'd2000000-0000-4000-8000-000000000010') <> 1 then
    raise exception 'AUTHORITATIVE_CHECKOUT_DURABILITY_MISMATCH';
  end if;
  if (select clinic_status from public.queue_entries
      where id = '51000000-0000-4000-8000-000000000011') <> 'registered'
     or exists (select 1 from public.panel_claims
                where queue_entry_id = '51000000-0000-4000-8000-000000000011')
     or exists (select 1 from public.panel_claim_checkout_requests
                where idempotency_key = 'd2000000-0000-4000-8000-000000000011') then
    raise exception 'FAILED_CHECKOUT_LEFT_DURABLE_STATE';
  end if;
  if (select clinic_status from public.queue_entries
      where id = '51000000-0000-4000-8000-000000000012') <> 'registered'
     or (select status from public.consultations
         where id = '61000000-0000-4000-8000-000000000012') <> 'in_progress'
     or (select amount from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000012') <> 25
     or (select status from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000012') <> 'approved'
     or exists (select 1 from public.panel_claim_checkout_requests
                where idempotency_key = 'd2000000-0000-4000-8000-000000000012') then
    raise exception 'MATERIALIZED_CHECKOUT_ROLLBACK_MISMATCH';
  end if;
end $checkout_storage_assertions$;

update public.panel_claims
set status = 'cancelled'
where id = '91000000-0000-4000-8000-000000000006';

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $cancelled_guard$
begin
  begin
    perform public.replace_panel_claim_portions(
      '91000000-0000-4000-8000-000000000006',
      '[{"amount":40},{"amount":60}]'::jsonb,
      'cancelled split attempt',
      0
    );
    raise exception 'CANCELLED_CLAIM_WAS_SPLIT';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PANEL_CLAIM_NOT_PAYABLE' then raise; end if;
  end;
end $cancelled_guard$;
reset role;

do $correction_integrity$
begin
  insert into public.completed_bill_correction_guard (
    consultation_id, queue_entry_id, actor_id
  ) values (
    '61000000-0000-4000-8000-000000000007',
    '51000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001'
  );
  delete from public.completed_bill_correction_guard
  where consultation_id = '61000000-0000-4000-8000-000000000007';
  update public.panel_claims
  set amount = 120,
      received_amount = 120,
      updated_by = '10000000-0000-4000-8000-000000000001'
  where id = '91000000-0000-4000-8000-000000000007';

  if (select amount from public.panel_claims
      where id = '91000000-0000-4000-8000-000000000007') <> 120 then
    raise exception 'AUDITED_UNSPLIT_TERMINAL_CORRECTION_WAS_BLOCKED';
  end if;

  begin
    update public.panel_claims
    set amount = 110
    where id = '91000000-0000-4000-8000-000000000004';
    raise exception 'DIRECT_SPLIT_PARENT_AMOUNT_UPDATE_WAS_ALLOWED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'SPLIT_PARENT_AMOUNT_REQUIRES_CORRECTION' then raise; end if;
  end;

  insert into public.completed_bill_correction_guard (
    consultation_id, queue_entry_id, actor_id
  ) values (
    '61000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001'
  );
  update public.consultation_items
  set price = 120
  where id = '71000000-0000-4000-8000-000000000004';
  delete from public.completed_bill_correction_guard
  where consultation_id = '61000000-0000-4000-8000-000000000004';
  update public.panel_claims
  set amount = 120,
      updated_by = '10000000-0000-4000-8000-000000000001'
  where id = '91000000-0000-4000-8000-000000000004';

  if (select sum(amount) from public.panel_claim_portions
      where panel_claim_id = '91000000-0000-4000-8000-000000000004') <> 120
     or (select amount from public.panel_claim_portions
         where panel_claim_id = '91000000-0000-4000-8000-000000000004'
           and portion_no = 2) <> 90
     or (select portions_version from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000004') <> 3 then
    raise exception 'SPLIT_CORRECTION_DID_NOT_REBALANCE_ATOMICALLY';
  end if;

  begin
    insert into public.completed_bill_correction_guard (
      consultation_id, queue_entry_id, actor_id
    ) values (
      '61000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    );
    update public.consultation_items
    set price = 30
    where id = '71000000-0000-4000-8000-000000000001';
    delete from public.completed_bill_correction_guard
    where consultation_id = '61000000-0000-4000-8000-000000000001';
    update public.panel_claims
    set amount = 30,
        updated_by = '10000000-0000-4000-8000-000000000001'
    where id = '91000000-0000-4000-8000-000000000001';
    raise exception 'PAID_SPLIT_WAS_STRANDED_BY_CORRECTION';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PANEL_SPLIT_CORRECTION_BELOW_RECEIPTS' then raise; end if;
  end;

  if (select price from public.consultation_items
      where id = '71000000-0000-4000-8000-000000000001') <> 100
     or (select amount from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000001') <> 100
     or (select sum(amount) from public.panel_claim_portions
         where panel_claim_id = '91000000-0000-4000-8000-000000000001') <> 100 then
    raise exception 'FAILED_PAID_SPLIT_CORRECTION_WAS_NOT_ATOMIC';
  end if;

  insert into public.completed_bill_correction_guard (
    consultation_id, queue_entry_id, actor_id
  ) values (
    '61000000-0000-4000-8000-000000000005',
    '51000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001'
  );
  update public.consultation_items
  set price = 120
  where id = '71000000-0000-4000-8000-000000000005';
  delete from public.completed_bill_correction_guard
  where consultation_id = '61000000-0000-4000-8000-000000000005';
  update public.panel_claims
  set amount = 120,
      updated_by = '10000000-0000-4000-8000-000000000001'
  where id = '91000000-0000-4000-8000-000000000005';

  if (select status from public.panel_claims
      where id = '91000000-0000-4000-8000-000000000005') <> 'rejected'
     or (select sum(amount) from public.panel_claim_portions
         where panel_claim_id = '91000000-0000-4000-8000-000000000005') <> 120 then
    raise exception 'TERMINAL_SPLIT_CORRECTION_DID_NOT_PRESERVE_STATUS';
  end if;

  begin
    update public.panel_claim_portions
    set amount = amount + 1
    where panel_claim_id = '91000000-0000-4000-8000-000000000004'
      and portion_no = 1;
    set constraints panel_claim_portions_integrity immediate;
    raise exception 'DEFERRED_PARENT_CHILD_INTEGRITY_WAS_NOT_ENFORCED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'PORTION_PARENT_AMOUNT_MISMATCH' then raise; end if;
  end;
end $correction_integrity$;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $stale_cancel$
begin
  begin
    perform public.cancel_panel_claim_portions(
      '91000000-0000-4000-8000-000000000004',
      'stale cancellation',
      2
    );
    raise exception 'STALE_SPLIT_CANCELLATION_WAS_ALLOWED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'STALE_PANEL_CLAIM_PORTIONS' then raise; end if;
  end;
end $stale_cancel$;
reset role;

do $runtime_assertions$
begin
  if (select count(*) from public.panel_claim_portions
      where panel_claim_id in (
        '91000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000003',
        '91000000-0000-4000-8000-000000000004',
        '91000000-0000-4000-8000-000000000005'
      )) <> 10 then
    raise exception 'AUTHORIZED_ROLES_DID_NOT_CREATE_EXACT_SPLITS';
  end if;
  if exists (select 1 from public.panel_claim_portions
      where panel_claim_id in (
        '91000000-0000-4000-8000-000000000006',
        '91000000-0000-4000-8000-000000000007',
        '91000000-0000-4000-8000-000000000008',
        '91000000-0000-4000-8000-000000000009'
      )) then
    raise exception 'DENIED_ROLE_CREATED_SPLIT';
  end if;
  if (select count(*) from public.panel_claim_portion_receipts
      where idempotency_key = 'd1000000-0000-4000-8000-000000000001') <> 1
     or (select received_amount from public.panel_claim_portions
         where panel_claim_id = '91000000-0000-4000-8000-000000000001' and portion_no = 1) <> 40
     or (select received_amount from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000001') <> 40 then
    raise exception 'IDEMPOTENT_REPLAY_DOUBLE_PAID';
  end if;
  if (select count(*) from public.panel_claim_portion_receipts
      where panel_claim_id = '91000000-0000-4000-8000-000000000002') <> 1
     or (select received_amount from public.panel_claim_portions
         where panel_claim_id = '91000000-0000-4000-8000-000000000002' and portion_no = 1) <> 30
     or (select received_amount from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000002') <> 30 then
    raise exception 'CONCURRENT_PAYMENT_TOTAL_VIOLATION';
  end if;
  if (select count(*) from public.panel_claim_portion_receipts
      where panel_claim_id = '91000000-0000-4000-8000-000000000003') <> 1
     or (select received_amount from public.panel_claims
         where id = '91000000-0000-4000-8000-000000000003') <> 40 then
    raise exception 'SPLIT_PAYMENT_SERIALIZATION_VIOLATION';
  end if;
  if (select amount from public.panel_claim_portions
      where panel_claim_id = '91000000-0000-4000-8000-000000000004' and portion_no = 1) <> 30
     or (select amount from public.panel_claim_portions
          where panel_claim_id = '91000000-0000-4000-8000-000000000004' and portion_no = 2) <> 90
     or (select sum(amount) from public.panel_claim_portions
          where panel_claim_id = '91000000-0000-4000-8000-000000000004') <> 120 then
    raise exception 'SPLIT_SPLIT_SERIALIZATION_VIOLATION';
  end if;
end $runtime_assertions$;
`, 'utf8');

        psql(bootstrapPath);
        psql(migrationPath);
        psql(fixturePath);
        psql(assertionsPath);
        psql(portionBootstrapPath);
        psql(portionMigrationPath);
        psql(splitFixturePath);
        psql(portionSecurityAssertionsPath);
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
