import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_fix_resident_consultation_insert_returning.sql'),
);
const migration = migrationName
  ? readFileSync(resolve(migrationsDirectory, migrationName), 'utf8')
  : '';

describe('resident doctor consultation creation policy', () => {
  it('allows a clinical user to read back a consultation inserted for their doctor profile', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS consultations_select');
    expect(migration).toMatch(
      /public\.is_clinical\(auth\.uid\(\)\)[\s\S]*consultations\.doctor_id\s*=\s*public\.get_doctor_id_for_user\(auth\.uid\(\)\)/,
    );
    expect(migration).not.toContain(
      'public.is_current_user_consultation_doctor(consultations.id)',
    );
  });

  it('preserves operational and completed cross-doctor reads', () => {
    expect(migration).toContain(
      'public.can_read_operational_consultations(auth.uid())',
    );
    expect(migration).toContain("consultations.status = 'completed'");
    expect(migration).toContain(
      'public.can_read_cross_doctor_consultation(auth.uid())',
    );
  });
});
