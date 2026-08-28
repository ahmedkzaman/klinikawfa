import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const useEffect = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const fetchInsuranceProviderDirectory = vi.hoisted(() => vi.fn());

vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useEffect,
}));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
  useQuery,
  useQueryClient: vi.fn(),
  useMutation: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from, rpc, removeChannel: vi.fn() },
}));
vi.mock('@/hooks/clinic/useInsuranceProviders', () => ({ fetchInsuranceProviderDirectory }));

import { usePatientVisitHistory } from '@/hooks/patients/usePatientVisitHistory';
import { useCompletedTodayEntries } from '@/hooks/clinic/useQueueEntries';
import { usePatientConsultationHistory } from '@/hooks/clinic/useConsultations';
import { useDoctorClinicalActivity } from '@/hooks/clinic/useDoctorClinicalActivity';

const identities = {
  consultationDoctor: { id: 'doctor-consulting', name: 'Dr Consulting' },
  assignedDoctor: { id: 'doctor-assigned', name: 'Dr Assigned' },
  enteredBy: { id: 'user-entered', name: 'Operations Entered' },
} as const;

type QueryOptions = { queryFn: () => Promise<unknown> };

function latestQueryFn<T>() {
  const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions | undefined;
  if (!options) throw new Error('Expected a React Query configuration');
  return options.queryFn as () => Promise<T>;
}

function postgrestQuery(rowsForSelection: (selection: string) => unknown[]) {
  let selection = '';
  const query = {
    select: vi.fn((value: string) => {
      selection = value;
      return query;
    }),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    is: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: <TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
      resolve?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve({ data: rowsForSelection(selection), error: null }).then(resolve, reject),
  };

  return query;
}

function consultingDoctorFor(selection: string) {
  return selection.includes('doctors:doctor_id')
    ? identities.consultationDoctor
    : identities.enteredBy;
}

const postgresBin = process.env.POSTGRES_BIN
  ?? 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const postgresTools = {
  initdb: join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
  pgCtl: join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
  psql: join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql'),
};
const hasPostgresRuntime = Object.values(postgresTools).every(existsSync);
const requiresPostgresTest = process.env.REQUIRE_POSTGRES_TEST === '1' || process.env.CI === 'true';
const runsDisposablePostgresTest = process.env.RUN_DISPOSABLE_POSTGRES_REPORTING_TEST === '1'
  || requiresPostgresTest;

function requirePostgresRuntime() {
  if (requiresPostgresTest && !hasPostgresRuntime) {
    throw new Error('REQUIRE_POSTGRES_TEST=1 requires initdb, pg_ctl, and psql');
  }
}

describe('offline consultation reporting attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
    useEffect.mockImplementation(() => undefined);
    fetchInsuranceProviderDirectory.mockResolvedValue([]);
  });

  it('returns the consulting doctor from patient visit history', async () => {
    from.mockImplementation(() => postgrestQuery((selection) => [{
      id: 'queue-patient-history',
      consultations: {
        id: 'consultation-patient-history',
        doctor_id: identities.consultationDoctor.id,
        entered_by: identities.enteredBy.id,
        doctors: consultingDoctorFor(selection),
      },
    }]));

    usePatientVisitHistory('patient-1');
    const rows = await latestQueryFn<Array<{ consultations: { doctors: { name: string } } }>>()();

    expect(rows[0].consultations.doctors.name).toBe(identities.consultationDoctor.name);
    expect(rows[0].consultations.doctors.name).not.toBe(identities.assignedDoctor.name);
    expect(rows[0].consultations.doctors.name).not.toBe(identities.enteredBy.name);
  });

  it('returns pending completed visits with the consulting doctor for Completed Today', async () => {
    from.mockImplementation(() => postgrestQuery((selection) => {
      const consultationDoctor = consultingDoctorFor(selection);
      return [{
        id: 'queue-completed-today',
        assigned_doctor_id: identities.assignedDoctor.id,
        clinic_status: 'completed',
        consultations: [{
          id: 'consultation-completed-today',
          doctor_id: identities.consultationDoctor.id,
          entered_by: identities.enteredBy.id,
          approval_status: 'pending',
          doctors: consultationDoctor,
        }],
      }];
    }));

    useCompletedTodayEntries('2026-08-03');
    const rows = await latestQueryFn<Array<{
      doctors: { name: string };
      consultations: Array<{ approval_status: string }>;
    }>>()();

    expect(rows).toHaveLength(1);
    expect(rows[0].doctors.name).toBe(identities.consultationDoctor.name);
    expect(rows[0].doctors.name).not.toBe(identities.assignedDoctor.name);
    expect(rows[0].doctors.name).not.toBe(identities.enteredBy.name);
    expect(rows[0].consultations[0].approval_status).toBe('pending');
  });

  it('returns the consulting doctor from consultation history', async () => {
    from.mockImplementation(() => postgrestQuery((selection) => [{
      id: 'consultation-history',
      doctor_id: identities.consultationDoctor.id,
      entered_by: identities.enteredBy.id,
      doctors: consultingDoctorFor(selection),
    }]));

    usePatientConsultationHistory('patient-1');
    const rows = await latestQueryFn<Array<{ doctors: { name: string } }>>()();

    expect(rows[0].doctors.name).toBe(identities.consultationDoctor.name);
    expect(rows[0].doctors.name).not.toBe(identities.assignedDoctor.name);
    expect(rows[0].doctors.name).not.toBe(identities.enteredBy.name);
  });

  it('maps the doctor-attributed clinical activity RPC row for reporting consumers', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{
        activity_id: 'activity-1',
        activity_kind: 'procedure',
        activity_date: '2026-08-03T09:00:00.000Z',
        activity_name: 'Nebulisation',
        consultation_id: 'consultation-activity',
        queue_entry_id: 'queue-activity',
        queue_created_at: '2026-08-03T08:30:00.000Z',
        queue_sequence: 4,
        doctor_id: identities.consultationDoctor.id,
        doctor_name: identities.consultationDoctor.name,
        patient_name: 'Patient One',
        assigned_doctor_id: identities.assignedDoctor.id,
        entered_by: identities.enteredBy.id,
      }],
      error: null,
    });
    rpc.mockReturnValue({ range });

    useDoctorClinicalActivity(new Date('2026-08-03T00:00:00'), new Date('2026-08-03T12:00:00'));
    const summaries = await latestQueryFn<Array<{
      doctorId: string;
      doctorName: string;
      rows: Array<{ doctorId: string; doctorName: string }>;
    }>>()();

    expect(summaries).toEqual([expect.objectContaining({
      doctorId: identities.consultationDoctor.id,
      doctorName: identities.consultationDoctor.name,
      rows: [expect.objectContaining({
        doctorId: identities.consultationDoctor.id,
        doctorName: identities.consultationDoctor.name,
      })],
    })]);
    expect(summaries[0].doctorId).not.toBe(identities.assignedDoctor.id);
    expect(summaries[0].doctorId).not.toBe(identities.enteredBy.id);
  });

  it.skipIf(!runsDisposablePostgresTest)(
    'returns a pending completed consultation from the actual activity RPC and financial view',
    () => {
      requirePostgresRuntime();
      const root = mkdtempSync(join(tmpdir(), 'offline-reporting-'));
      const dataDirectory = join(root, 'data');
      const port = String(58000 + (process.pid % 1000));
      const bootstrapPath = join(root, 'bootstrap.sql');
      const assertionsPath = join(root, 'assertions.sql');
      const activityMigrations = [
        '20260728113618_add_doctor_clinical_activity_report.sql',
        '20260728124247_harden_doctor_clinical_activity_report.sql',
        '20260728144223_fix_doctor_clinical_activity_names.sql',
      ].map((migration) => resolve(process.cwd(), 'supabase/migrations', migration));
      const financialMigration = resolve(
        process.cwd(),
        'supabase/migrations/20260728153000_reconcile_completed_bill_financial_reporting.sql',
      );
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
        run(postgresTools.initdb, ['-D', dataDirectory, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        control(['-D', dataDirectory, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']);
        serverStarted = true;
        writeFileSync(bootstrapPath, `
create schema auth;
create role anon nologin;
create role authenticated nologin;
create table public.profiles (id uuid primary key, full_name text not null);
create table public.doctors (id uuid primary key, user_id uuid not null, name text not null);
create table public.patients (id uuid primary key, name text not null, reg_no text);
create table public.queue_entries (id uuid primary key, patient_id uuid not null, assigned_doctor_id uuid, clinic_status text not null, created_at timestamptz not null, queue_sequence integer, deleted_at timestamptz);
create table public.consultations (id uuid primary key, queue_entry_id uuid not null, patient_id uuid not null, doctor_id uuid not null, entered_by uuid, approval_status text not null, status text not null, diagnosis_id uuid, diagnosis_text text, deleted_at timestamptz);
create table public.services (id uuid primary key, name text not null, category text not null);
create table public.consultation_items (id uuid primary key, consultation_id uuid not null, service_id uuid, item_id uuid, package_id uuid, item_name text not null, price numeric not null, unit_cost numeric not null, quantity numeric not null, deleted_at timestamptz);
create table public.consultation_documents (id uuid primary key, consultation_id uuid not null, type text, template_name text, created_at timestamptz not null);
create table public.payments (id uuid primary key, queue_entry_id uuid not null, payment_method text, created_at timestamptz not null, deleted_at timestamptz);
create table public.diagnoses (id uuid primary key, name text not null);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function public.can_view_insights(user_id uuid) returns boolean language sql stable as $$ select user_id = '10000000-0000-4000-8000-000000000004'::uuid $$;
insert into public.profiles values
  ('10000000-0000-4000-8000-000000000001', 'Dr Consulting'),
  ('10000000-0000-4000-8000-000000000002', 'Dr Assigned'),
  ('10000000-0000-4000-8000-000000000003', 'Operations Entered');
insert into public.doctors values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Consulting record'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Assigned record');
insert into public.patients values ('30000000-0000-4000-8000-000000000001', 'Patient One', 'P-1');
insert into public.queue_entries values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'completed', '2026-08-03 09:00:00+00', 4, null);
insert into public.consultations values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'pending', 'completed', null, 'Viral illness', null);
insert into public.services values ('60000000-0000-4000-8000-000000000001', 'Nebulisation', 'Procedure');
insert into public.consultation_items values ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', null, null, 'Nebulisation', 125, 20, 1, null);
`, 'utf8');
        writeFileSync(assertionsPath, `
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', false);
do $$
declare v_activity_doctor uuid; v_activity_name text; v_financial_doctor uuid; v_revenue numeric;
begin
  begin
    perform public.get_doctor_clinical_activity('2026-01-01', '2027-01-02');
    raise exception 'FINAL_ACTIVITY_RANGE_CAP_MISSING';
  exception when sqlstate '22023' then
    if sqlerrm <> 'DATE_RANGE_TOO_LARGE' then raise; end if;
  end;
  select doctor_id, doctor_name into v_activity_doctor, v_activity_name
  from public.get_doctor_clinical_activity('2026-08-03', '2026-08-03')
  where activity_id = '70000000-0000-4000-8000-000000000001';
  if v_activity_doctor <> '20000000-0000-4000-8000-000000000001' or v_activity_name <> 'Dr Consulting' then raise exception 'ACTIVITY_DOCTOR_ATTRIBUTION_FAILED'; end if;
  select doctor_id, revenue into v_financial_doctor, v_revenue
  from public.insight_financials_view
  where id = '70000000-0000-4000-8000-000000000001';
  if v_financial_doctor <> '20000000-0000-4000-8000-000000000001' or v_revenue <> 125 then raise exception 'PENDING_FINANCIAL_REPORTING_FAILED'; end if;
end $$;
`, 'utf8');

        psql(bootstrapPath);
        activityMigrations.forEach(psql);
        psql(financialMigration);
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
