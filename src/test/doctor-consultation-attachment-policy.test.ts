import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260806233000_allow_doctor_consultation_attachments.sql',
  'utf8',
);

describe('doctor consultation attachment permissions', () => {
  it('allows the assigned clinical doctor while preserving offline reservation gating', () => {
    expect(migration).toContain("role::text IN ('resident_doctor', 'doctor_admin', 'locum')");
    expect(migration).toContain('public.is_exact_ops_staff(p_actor_id)');
    expect(migration).toContain('DROP POLICY IF EXISTS "attachments_insert"');
  });
});
