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
});
