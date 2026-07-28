import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('doctor clinical activity report migration', () => {
  it('defines the protected doctor-attributed activity RPC', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = readdirSync(migrationsDirectory)
      .filter((file) => /_add_doctor_clinical_activity_report\.sql$/.test(file));
    expect(migrationFiles).toHaveLength(1);

    const sql = readFileSync(join(migrationsDirectory, migrationFiles[0]), 'utf8');

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

  it('keeps nullable queue sequence in the generated RPC type', () => {
    const types = readFileSync(
      resolve(process.cwd(), 'src/integrations/supabase/types.ts'),
      'utf8',
    );

    expect(types).toMatch(/get_doctor_clinical_activity:[\s\S]*queue_sequence: number \| null/i);
  });
});
