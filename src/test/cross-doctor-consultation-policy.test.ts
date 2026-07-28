import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_cross_doctor_completed_consultation_reads.sql'),
);
const migration = migrationName
  ? readFileSync(resolve(migrationsDirectory, migrationName), 'utf8')
  : '';

describe('cross-doctor consultation database policy', () => {
  it('grants completed cross-doctor reads only to resident and admin doctors', () => {
    expect(migration).toContain(
      'public.can_read_cross_doctor_consultation(auth.uid())',
    );
    expect(migration).toContain("'resident_doctor'");
    expect(migration).toContain("'doctor_admin'");
    expect(migration).toContain("consultations.status = 'completed'");
  });

  it('preserves each clinical user access to their own consultations', () => {
    expect(migration).toContain(
      'public.is_current_user_consultation_doctor(consultations.id)',
    );
  });

  it('keeps cross-doctor consultations read-only at the database boundary', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS consultations_update');
    expect(migration).toMatch(
      /consultations\.doctor_id\s*=\s*public\.get_doctor_id_for_user\(auth\.uid\(\)\)/,
    );
    expect(migration).not.toContain(
      'CREATE POLICY consultations_update\n  ON public.consultations\n  FOR UPDATE\n  TO authenticated\n  USING (public.is_clinical(auth.uid()))',
    );
  });

  it('keeps operational consultation reads needed by billing and dispensary', () => {
    expect(migration).toContain(
      'public.can_read_operational_consultations(auth.uid())',
    );
    expect(migration).toContain("'ops_staff'");
    expect(migration).toContain("'staff_nurse'");
    expect(migration).toContain("'purchaser'");
  });
});
