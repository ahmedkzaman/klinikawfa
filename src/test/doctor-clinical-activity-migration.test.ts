import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('doctor clinical activity report migration', () => {
  const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
  const baseMigrationName = '20260728113618_add_doctor_clinical_activity_report.sql';
  const hardeningMigrationName = '20260728124247_harden_doctor_clinical_activity_report.sql';
  const doctorNameFixMigrationName = '20260728144223_fix_doctor_clinical_activity_names.sql';

  it('reconciles the base migration filename with production history', () => {
    const migrationFiles = readdirSync(migrationsDirectory)
      .filter((file) => /_add_doctor_clinical_activity_report\.sql$/.test(file));

    expect(migrationFiles).toEqual([baseMigrationName]);
  });

  it('keeps the protected doctor-attributed activity RPC contract in the deployed base', () => {
    const sql = readFileSync(join(migrationsDirectory, baseMigrationName), 'utf8');

    expect(sql).toMatch(/get_doctor_clinical_activity\s*\(\s*_start_date date,\s*_end_date date/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.can_view_insights\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/c\.doctor_id/i);
    expect(sql).not.toMatch(/cd\.created_by\s+as\s+doctor_id/i);
    expect(sql).toMatch(/s\.id\s*=\s*ci\.service_id/i);
    expect(sql).not.toMatch(/s\.id\s*=\s*ci\.item_id/i);
    expect(sql).toMatch(/s\.category\s*=\s*'Procedure'/i);
    expect(sql).toMatch(/ci\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/c\.status\s*=\s*'completed'/i);
    expect(sql).toMatch(/lower\(coalesce\(cd\.type,\s*''\)\)\s+in\s*\('mc',\s*'quarantine',\s*'referral'\)/i);
    expect(sql).toMatch(/qe\.created_at\s*>=\s*\(_start_date::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/qe\.created_at\s*<\s*\(\(_end_date\s*\+\s*1\)::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/cd\.created_at\s*>=\s*\(_start_date::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/cd\.created_at\s*<\s*\(\(_end_date\s*\+\s*1\)::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/revoke all on function public\.get_doctor_clinical_activity\(date, date\) from public/i);
    expect(sql).toMatch(/revoke all on function public\.get_doctor_clinical_activity\(date, date\) from anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_doctor_clinical_activity\(date, date\) to authenticated/i);
  });

  it('hardens doctor fallback, deterministic ordering, and the exact 365-day range cap', () => {
    const sql = readFileSync(join(migrationsDirectory, hardeningMigrationName), 'utf8');

    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.get_doctor_clinical_activity/i);
    expect(sql).toMatch(/\(_end_date\s*-\s*_start_date\)\s*>\s*365/i);
    expect(sql).not.toMatch(/\(_end_date\s*-\s*_start_date\)\s*>\s*366/i);
    expect(sql).toMatch(
      /case\s+when\s+c\.doctor_id\s+is\s+null\s+then\s+'Unassigned'\s+else\s+coalesce\(\s*nullif\(btrim\(profile\.full_name\),\s*''\),\s*nullif\(btrim\(doctor\.name\),\s*''\),\s*'Unknown doctor'\s*\)\s+end/i,
    );
    expect(sql).toMatch(
      /order\s+by\s+activity\.activity_date,\s*activity\.activity_kind,\s*activity\.activity_id/i,
    );
  });

  it('resolves consultation doctor records to their linked profile names', () => {
    const sql = readFileSync(join(migrationsDirectory, doctorNameFixMigrationName), 'utf8');

    expect(sql.match(/doctor\.id\s*=\s*c\.doctor_id/gi)).toHaveLength(2);
    expect(sql.match(/profile\.id\s*=\s*doctor\.user_id/gi)).toHaveLength(2);
    expect(sql).not.toMatch(/doctor\.user_id\s*=\s*c\.doctor_id/i);
    expect(sql).not.toMatch(/profile\.id\s*=\s*c\.doctor_id/i);
  });

  it('preserves authorization, sensitive-field boundaries, classifications, and filters in the hardening migration', () => {
    const sql = readFileSync(join(migrationsDirectory, hardeningMigrationName), 'utf8');

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.can_view_insights\(auth\.uid\(\)\)/i);
    expect(sql).not.toMatch(/cd\.created_by\s+as\s+doctor_id/i);
    expect(sql).toMatch(/s\.id\s*=\s*ci\.service_id/i);
    expect(sql).toMatch(/s\.category\s*=\s*'Procedure'/i);
    expect(sql).toMatch(/ci\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/c\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/c\.status\s*=\s*'completed'/i);
    expect(sql).toMatch(/lower\(coalesce\(cd\.type,\s*''\)\)\s+in\s*\('mc',\s*'quarantine',\s*'referral'\)/i);
    expect(sql).toMatch(/qe\.created_at\s*>=\s*\(_start_date::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/qe\.created_at\s*<\s*\(\(_end_date\s*\+\s*1\)::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/cd\.created_at\s*>=\s*\(_start_date::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/cd\.created_at\s*<\s*\(\(_end_date\s*\+\s*1\)::timestamp\s+at\s+time\s+zone\s+'Asia\/Kuala_Lumpur'\)/i);
    expect(sql).toMatch(/revoke all on function public\.get_doctor_clinical_activity\(date, date\) from public/i);
    expect(sql).toMatch(/revoke all on function public\.get_doctor_clinical_activity\(date, date\) from anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_doctor_clinical_activity\(date, date\) to authenticated/i);
  });

  it('keeps the queue sequence column in the generated RPC type', () => {
    const types = readFileSync(
      resolve(process.cwd(), 'src/integrations/supabase/types.ts'),
      'utf8',
    );

    // The RPC returns queue_sequence for every activity row. Current generator
    // (pg-meta v0.9x) renders the TABLE-return column as non-nullable 'number'
    // even though the column is nullable in the function declaration; assert
    // the column remains part of the generated contract.
    expect(types).toMatch(/get_doctor_clinical_activity:[\s\S]*queue_sequence: number/i);
  });
});
