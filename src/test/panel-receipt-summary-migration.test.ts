import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const originalMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817090000_add_panel_receipt_summary.sql',
);
const hardeningMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817100000_harden_panel_receipt_history.sql',
);
const reassignmentSafetyMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817110000_exclude_reassigned_panel_receipt_backfills.sql',
);
const postgresBin = process.env.POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const tools = {
  initdb: join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
  pgCtl: join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
  psql: join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql'),
};
const hasPostgresRuntime = Object.values(tools).every(existsSync);

const bootstrapSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role fixture_event_mutator nologin;
create schema auth;
create schema private;
grant usage on schema private to fixture_event_mutator;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create type public.app_role as enum (
  'special_admin', 'admin', 'doctor_admin', 'resident_doctor',
  'ops_staff', 'operations', 'staff', 'locum', 'guest'
);
create table public.user_roles(user_id uuid primary key, role public.app_role not null);
create table public.clinic_role_permissions(
  role public.app_role not null,
  permission_key text not null,
  allowed boolean not null default false,
  primary key(role, permission_key)
);
create table public.clinic_user_permission_overrides(
  user_id uuid not null,
  permission_key text not null,
  allowed boolean not null,
  primary key(user_id, permission_key)
);
create function public.has_clinic_permission(_permission_key text, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false else coalesce(
    (select o.allowed from public.clinic_user_permission_overrides o
      where o.user_id = _user_id and o.permission_key = _permission_key),
    (select p.allowed from public.user_roles r join public.clinic_role_permissions p on p.role = r.role
      where r.user_id = _user_id and p.permission_key = _permission_key), false)
  end
$$;
create function public.can_view_insights(_user_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role in ('admin', 'doctor_admin'))
$$;
create table public.panel_claims(
  id uuid primary key,
  queue_entry_id uuid,
  panel_id uuid not null,
  amount numeric not null,
  received_amount numeric not null default 0,
  status text not null,
  due_date date,
  received_date date,
  created_at timestamptz not null default statement_timestamp()
);
create table public.panel_claim_portions(id uuid primary key, panel_claim_id uuid not null);
create table public.panel_claim_portion_receipts(id uuid primary key, panel_claim_id uuid not null);
create table private.financial_panel_claim_events(
  id bigint generated always as identity primary key,
  panel_claim_id uuid not null,
  queue_entry_id uuid,
  panel_id uuid not null,
  event_kind text not null check(event_kind in (
    'claim_created', 'claim_edit', 'receipt', 'receipt_reversal',
    'void', 'reassignment_out', 'reassignment_in', 'synthetic_backfill'
  )),
  amount numeric not null,
  received_amount numeric not null,
  receipt_delta numeric not null,
  status text not null,
  due_date date,
  occurred_at timestamptz,
  provenance text not null constraint financial_panel_claim_events_provenance_check
    check(provenance in ('recorded', 'synthetic_backfill', 'inferred_source_timestamp')),
  attribution_complete boolean not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint financial_panel_claim_events_check check(
    (attribution_complete and occurred_at is not null and provenance in ('recorded', 'inferred_source_timestamp'))
    or (not attribution_complete and provenance = 'synthetic_backfill')
  )
);
create function private.prevent_financial_event_change() returns trigger
language plpgsql as $$
begin
  raise exception 'FINANCIAL_EVENT_IMMUTABLE' using errcode = '42501';
end
$$;
create trigger prevent_financial_panel_claim_event_change
before update or delete on private.financial_panel_claim_events
for each row execute function private.prevent_financial_event_change();
grant select, update, delete on private.financial_panel_claim_events to fixture_event_mutator;
revoke all on private.financial_panel_claim_events from public, anon, authenticated;
revoke all on public.panel_claim_portion_receipts from public, anon, authenticated;
create function private.capture_financial_panel_claim_event() returns trigger language plpgsql as $$
begin return case when tg_op = 'DELETE' then old else new end; end
$$;
create trigger capture_financial_panel_claim_event
after insert or update or delete on public.panel_claims
for each row execute function private.capture_financial_panel_claim_event();

insert into public.user_roles(user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'resident_doctor'),
  ('10000000-0000-4000-8000-000000000003', 'operations'),
  ('10000000-0000-4000-8000-000000000004', 'staff');

insert into public.panel_claims(id, queue_entry_id, panel_id, amount, received_amount, status, received_date) values
  ('20000000-0000-4000-8000-000000000001', null, '30000000-0000-4000-8000-000000000001', 100, 100, 'received', '2026-07-15'),
  ('20000000-0000-4000-8000-000000000002', null, '30000000-0000-4000-8000-000000000001', 100, 100, 'received', '2026-09-02'),
  ('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 100, 100, 'received', '2026-11-10');
insert into private.financial_panel_claim_events(
  panel_claim_id, queue_entry_id, panel_id, event_kind, amount, received_amount,
  receipt_delta, status, due_date, occurred_at, provenance, attribution_complete
) values
  ('20000000-0000-4000-8000-000000000001', null, '30000000-0000-4000-8000-000000000001', 'claim_created', 100, 100, 0, 'received', null, '2026-07-01', 'inferred_source_timestamp', true),
  ('20000000-0000-4000-8000-000000000002', null, '30000000-0000-4000-8000-000000000001', 'receipt', 100, 40, 40, 'submitted', null, '2026-08-05 00:00:00+08', 'recorded', true),
  ('20000000-0000-4000-8000-000000000002', null, '30000000-0000-4000-8000-000000000001', 'receipt', 100, 100, 60, 'received', null, '2026-09-02 00:00:00+08', 'recorded', true),
  ('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'reassignment_out', 100, 0, -100, 'cancelled', null, '2026-11-09 09:00:00+08', 'recorded', true),
  ('20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'reassignment_in', 100, 100, 100, 'received', null, '2026-11-09 09:00:00+08', 'recorded', true);
`;

const assertionsSql = String.raw`
insert into public.panel_claims(id, queue_entry_id, panel_id, amount, received_amount, status) values
  ('20000000-0000-4000-8000-000000000003', null, '30000000-0000-4000-8000-000000000001', 30, 0, 'submitted');
update public.panel_claims set received_amount = 30, received_date = '2026-06-05', status = 'received'
where id = '20000000-0000-4000-8000-000000000003';

do $$
begin
  if (select count(*) from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000001'
        and provenance = 'historical_receipt_date_backfill'
        and receipt_delta = 100
        and timezone('Asia/Kuala_Lumpur', occurred_at)::date = date '2026-07-15') <> 1 then
    raise exception 'HISTORICAL_RECEIPT_BACKFILL_WRONG';
  end if;
  if not exists(select 1 from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000003'
        and event_kind = 'receipt' and receipt_delta = 30
        and timezone('Asia/Kuala_Lumpur', occurred_at)::date = date '2026-06-05') then
    raise exception 'BACKDATED_RECEIPT_EVENT_WRONG';
  end if;
  if exists(select 1 from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000006'
        and provenance = 'historical_receipt_date_backfill') then
    raise exception 'REASSIGNED_HISTORY_WAS_BACKFILLED';
  end if;
  if (select coalesce(sum(receipt_delta), 0) from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000006'
        and event_kind = 'reassignment_out'
        and queue_entry_id = '40000000-0000-4000-8000-000000000001') <> -100 then
    raise exception 'Q1_REASSIGNMENT_OUT_CHANGED';
  end if;
  if (select coalesce(sum(receipt_delta), 0) from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000006'
        and event_kind = 'reassignment_in'
        and queue_entry_id = '40000000-0000-4000-8000-000000000002') <> 100 then
    raise exception 'Q2_REASSIGNMENT_IN_CHANGED';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.financial_panel_claim_events'::regclass
      and tgname = 'prevent_financial_panel_claim_event_change'
      and tgenabled = 'O'
  ) then
    raise exception 'PANEL_EVENT_IMMUTABILITY_GUARD_NOT_ENABLED';
  end if;
end
$$;

set role fixture_event_mutator;
do $$
begin
  begin
    update private.financial_panel_claim_events
    set status = status
    where panel_claim_id = '20000000-0000-4000-8000-000000000006';
    raise exception 'IMMUTABLE_PANEL_EVENT_UPDATE_ALLOWED';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'FINANCIAL_EVENT_IMMUTABLE' then raise; end if;
  end;

  begin
    delete from private.financial_panel_claim_events
    where panel_claim_id = '20000000-0000-4000-8000-000000000006';
    raise exception 'IMMUTABLE_PANEL_EVENT_DELETE_ALLOWED';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'FINANCIAL_EVENT_IMMUTABLE' then raise; end if;
  end;
end
$$;
reset role;

set role authenticated;
do $$
declare result jsonb;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  result := public.get_panel_receipt_summary('2026-07-01', '2026-07-31');
  if result->>'total_received' <> '100.00'
     or (result->>'attribution_complete')::boolean is not false
     or result->>'incomplete_claims' <> '1' then
    raise exception 'HISTORICAL_TOTAL_WRONG: %', result;
  end if;
  result := public.get_panel_receipt_summary('2026-08-01', '2026-08-31');
  if result->>'total_received' <> '40.00' then raise exception 'AUGUST_SPLIT_WRONG: %', result; end if;
  result := public.get_panel_receipt_summary('2026-09-01', '2026-09-30');
  if result->>'total_received' <> '60.00' then raise exception 'SEPTEMBER_SPLIT_WRONG: %', result; end if;
  result := public.get_panel_receipt_summary('2026-06-05', '2026-06-05');
  if result->>'total_received' <> '30.00' then raise exception 'BACKDATED_TOTAL_WRONG: %', result; end if;
  result := public.get_panel_receipt_summary('2026-11-01', '2026-11-30');
  if result->>'total_received' <> '0.00'
     or (result->>'attribution_complete')::boolean is not false
     or result->>'incomplete_claims' <> '1' then
    raise exception 'REASSIGNED_HISTORY_NOT_INCOMPLETE: %', result;
  end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  perform public.get_panel_receipt_summary('2026-08-01', '2026-08-31');
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  perform public.get_panel_receipt_summary('2026-08-01', '2026-08-31');
end
$$;
reset role;
insert into public.clinic_user_permission_overrides values
  ('10000000-0000-4000-8000-000000000003', 'reports.view', false),
  ('10000000-0000-4000-8000-000000000004', 'reports.view', true);
set role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  begin
    perform public.get_panel_receipt_summary('2026-08-01', '2026-08-31');
    raise exception 'EXPLICIT_DENIAL_BYPASSED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
  begin
    perform public.get_panel_receipt_summary('2026-08-01', '2026-08-31');
    raise exception 'UNSUPPORTED_ROLE_GRANTED';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

insert into public.panel_claims(id, queue_entry_id, panel_id, amount, received_amount, status) values
  ('20000000-0000-4000-8000-000000000004', null, '30000000-0000-4000-8000-000000000001', 50, 0, 'submitted');
update public.panel_claims set received_amount = 50, received_date = '2026-06-10', status = 'received'
where id = '20000000-0000-4000-8000-000000000004';
delete from public.panel_claims where id = '20000000-0000-4000-8000-000000000004';
do $$
begin
  if not exists(select 1 from private.financial_panel_claim_events
      where panel_claim_id = '20000000-0000-4000-8000-000000000004'
        and event_kind = 'void' and receipt_delta = -50) then
    raise exception 'VOID_DELTA_MISSING';
  end if;
end
$$;
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare result jsonb := public.get_panel_receipt_summary(current_date, current_date);
begin
  if result->>'total_received' <> '-50.00' then raise exception 'VOID_TOTAL_WRONG: %', result; end if;
end
$$;
reset role;

alter table public.panel_claims disable trigger capture_financial_panel_claim_event;
insert into public.panel_claims(id, queue_entry_id, panel_id, amount, received_amount, status, received_date) values
  ('20000000-0000-4000-8000-000000000005', null, '30000000-0000-4000-8000-000000000001', 100, 100, 'received', '2026-10-01');
alter table public.panel_claims enable trigger capture_financial_panel_claim_event;
insert into private.financial_panel_claim_events(
  panel_claim_id, queue_entry_id, panel_id, event_kind, amount, received_amount,
  receipt_delta, status, due_date, occurred_at, provenance, attribution_complete
) values ('20000000-0000-4000-8000-000000000005', null, '30000000-0000-4000-8000-000000000001',
  'receipt', 100, 60, 60, 'submitted', null, '2026-10-01 00:00:00+08', 'recorded', true);
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
do $$
declare result jsonb := public.get_panel_receipt_summary('2026-10-01', '2026-10-31');
begin
  if (result->>'attribution_complete')::boolean is not false or result->>'incomplete_claims' <> '2' then
    raise exception 'INCOMPLETE_HISTORY_NOT_EXPLICIT: %', result;
  end if;
end
$$;
`;

describe('panel receipt summary migration', () => {
  it('defines the final role-safe, auditable receipt history contract after the original migration', () => {
    expect(existsSync(hardeningMigrationPath)).toBe(true);
    expect(existsSync(reassignmentSafetyMigrationPath)).toBe(true);
    const sql = readFileSync(hardeningMigrationPath, 'utf8');
    const reassignmentSafetySql = readFileSync(reassignmentSafetyMigrationPath, 'utf8');

    expect(sql).toMatch(/can_view_insight_workspace/i);
    expect(sql).toMatch(/has_clinic_permission\('reports\.view'/i);
    expect(sql).not.toMatch(/can_view_insights\(/i);
    expect(sql).toMatch(/historical_receipt_date_backfill/i);
    expect(sql).toMatch(/event\.event_kind in \('receipt', 'receipt_reversal', 'void'\)/i);
    expect(sql).toMatch(/if v_event_kind = 'receipt'[\s\S]*new\.received_date/i);
    expect(sql).toContain("'attribution_complete'");
    expect(reassignmentSafetySql).toMatch(/reassignment_out.*reassignment_in/is);
    expect(reassignmentSafetySql).toMatch(/historical_receipt_date_backfill/i);
  });

  it.skipIf(!hasPostgresRuntime)(
    'executes role gates, idempotent history, voids, and backdated receipts in PostgreSQL',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'panel-receipt-summary-'));
      const data = join(root, 'data');
      const bootstrap = join(root, 'bootstrap.sql');
      const assertions = join(root, 'assertions.sql');
      const port = String(61000 + (process.pid % 500));
      const run = (tool: string, args: string[]) => execFileSync(tool, args, {
        encoding: 'utf8', stdio: 'pipe', timeout: 60_000, windowsHide: true,
      });
      const control = (args: string[]) => execFileSync(tools.pgCtl, args, {
        stdio: 'ignore', timeout: 60_000, windowsHide: true,
      });
      const psql = (path: string) => run(tools.psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-f', path]);

      writeFileSync(bootstrap, bootstrapSql);
      writeFileSync(assertions, assertionsSql);
      try {
        run(tools.initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8']);
        control(['-D', data, '-o', `-F -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start']);
        psql(bootstrap);
        psql(originalMigrationPath);
        psql(hardeningMigrationPath);
        psql(hardeningMigrationPath);
        psql(reassignmentSafetyMigrationPath);
        psql(reassignmentSafetyMigrationPath);
        expect(() => psql(assertions)).not.toThrow();
      } finally {
        try { control(['-D', data, '-m', 'fast', '-w', 'stop']); } catch { /* server may not have started */ }
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
