import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationDirectory)
  .find((file) => file.endsWith('_allow_locum_offline_consulting_doctors.sql'));
const migrationPath = migrationName ? join(migrationDirectory, migrationName) : '';

const postgresBin = process.env.POSTGRES_BIN
  ?? 'C:/Users/ahmed/Documents/Codex/tools/postgresql/17.10/pgsql/bin';
const initdb = join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
const pgCtl = join(postgresBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const psql = join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql');
const hasPostgres = [initdb, pgCtl, psql].every(existsSync);

describe('offline consultation locum eligibility', () => {
  it.skipIf(!hasPostgres)(
    'allows exactly one active clinical role including locum and preserves selected-doctor ownership',
    () => {
      expect(migrationPath, 'locum eligibility migration is missing').not.toBe('');

      const root = mkdtempSync(join(tmpdir(), 'offline-locum-'));
      const data = join(root, 'data');
      const bootstrap = join(root, 'bootstrap.sql');
      const assertions = join(root, 'assertions.sql');
      const port = String(59000 + (process.pid % 500));
      const run = (binary: string, args: string[]) =>
        execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
      const runSql = (path: string) => run(psql, [
        '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
        '-U', 'postgres', '-d', 'postgres', '-f', path,
      ]);

      writeFileSync(bootstrap, String.raw`
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  status text NOT NULL,
  on_duty boolean NOT NULL DEFAULT false,
  avatar_url text
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.consultations (id uuid PRIMARY KEY, doctor_id uuid REFERENCES public.doctors(id));

CREATE FUNCTION public.is_eligible_offline_consultation_doctor(p_doctor_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_current_offline_consultation_doctor(
  p_consultation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
`);

      writeFileSync(assertions, String.raw`
INSERT INTO public.doctors (id, user_id, name, status) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Active Locum', 'active'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Active Resident', 'active'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Ordinary Staff', 'active'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Inactive Locum', 'inactive'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Multi Role', 'active');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-4000-8000-000000000001', 'locum'),
  ('20000000-0000-4000-8000-000000000002', 'resident_doctor'),
  ('20000000-0000-4000-8000-000000000003', 'staff'),
  ('20000000-0000-4000-8000-000000000004', 'locum'),
  ('20000000-0000-4000-8000-000000000005', 'locum'),
  ('20000000-0000-4000-8000-000000000005', 'staff');
INSERT INTO public.consultations (id, doctor_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  IF NOT public.is_eligible_offline_consultation_doctor('10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'active locum must be eligible';
  END IF;
  IF NOT public.is_eligible_offline_consultation_doctor('10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'active resident must remain eligible';
  END IF;
  IF public.is_eligible_offline_consultation_doctor('10000000-0000-4000-8000-000000000003')
     OR public.is_eligible_offline_consultation_doctor('10000000-0000-4000-8000-000000000004')
     OR public.is_eligible_offline_consultation_doctor('10000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'nonclinical, inactive, and multi-role doctors must remain ineligible';
  END IF;
  IF NOT public.is_current_offline_consultation_doctor(
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'selected locum must own the review boundary';
  END IF;
  IF public.is_current_offline_consultation_doctor(
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'another clinician must not own the locum consultation';
  END IF;
END
$$;
`);

      try {
        run(initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        execFileSync(pgCtl, [
          '-D', data,
          '-l', join(root, 'postgres.log'),
          '-o', `-h 127.0.0.1 -p ${port} -k ${root}`,
          'start', '-w',
        ], { stdio: 'ignore' });
        runSql(bootstrap);
        runSql(migrationPath);
        expect(() => runSql(assertions)).not.toThrow();
      } finally {
        try {
          execFileSync(pgCtl, ['-D', data, 'stop', '-m', 'immediate', '-w'], { stdio: 'ignore' });
        } catch {
          // The server may not have started; temp cleanup is still required.
        }
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
