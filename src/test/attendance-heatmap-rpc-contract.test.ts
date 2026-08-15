import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql',
);

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('clinical attendance heatmap observations RPC contract', () => {
  it('returns aggregate operating-slot observations with the regression interface', () => {
    const sql = migrationSql();

    expect(sql).toContain("'observations'");
    expect(sql).toMatch(/'doctorsRostered'[\s\S]*'selectedDoctorScheduled'[\s\S]*'backupDoctorCovered'/);
    expect(sql).toMatch(/FILTER \(WHERE cd\.period = 'selected' AND cd\.operating\)/);
  });

  it('does not add row or patient identifiers to observations', () => {
    const sql = migrationSql();
    const observationJsonFragment = sql.match(/observations AS MATERIALIZED \([\s\S]*?\n {2}\),\n {2}doctor_directory AS MATERIALIZED/)?.[0] ?? '';

    for (const forbidden of ['queueEntryId', 'patientId', 'patientName', 'icNo', 'consultationNotes']) {
      expect(observationJsonFragment).not.toContain(forbidden);
    }
  });

  it('bounds queue rows before joining the active consultation and avoids all-history DISTINCT materialization', () => {
    const sql = migrationSql();
    const queueCandidates = sql.indexOf('queue_candidates AS MATERIALIZED');
    const consultationJoin = sql.indexOf('JOIN public.consultations AS c');

    expect(queueCandidates).toBeGreaterThan(-1);
    expect(consultationJoin).toBeGreaterThan(queueCandidates);
    expect(sql).toMatch(/queue_candidates AS MATERIALIZED \([\s\S]*qe\.created_at >=[\s\S]*qe\.created_at </);
    expect(sql).toMatch(/JOIN public\.consultations AS c[\s\S]*c\.queue_entry_id = qe\.id[\s\S]*c\.deleted_at IS NULL/);
    expect(sql).not.toContain('qualifying_consultations AS MATERIALIZED');
    expect(sql).not.toMatch(/DISTINCT ON \(c\.queue_entry_id\)/);
  });

  it('emits model observations from only the latest 52 distinct operating weeks', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/observation_weeks AS MATERIALIZED \([\s\S]*date_trunc\('week',[\s\S]*LIMIT 52/);
    expect(sql).toMatch(/observations AS MATERIALIZED \([\s\S]*JOIN observation_weeks/);
  });
});
