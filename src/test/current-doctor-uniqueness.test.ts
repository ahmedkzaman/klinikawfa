import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('current doctor uniqueness', () => {
  it('uses deterministic limited lookups before and after an insert race', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/hooks/clinic/useCurrentDoctor.ts'),
      'utf8',
    );

    expect(source.match(/\.order\('created_at', \{ ascending: true \}\)/g)).toHaveLength(2);
    expect(source.match(/\.limit\(1\)/g)).toHaveLength(2);
    expect(source).toContain('Insert may race with another tab');
  });

  it('consolidates duplicates before enforcing one linked doctor per account', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725083218_enforce_unique_doctor_profile.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('UPDATE public.consultations');
    expect(migration).toContain('UPDATE public.queue_entries');
    expect(migration).toContain('UPDATE public.clinic_appointments');
    expect(migration).toContain('UPDATE public.room_assignments');
    expect(migration).toContain('DELETE FROM public.doctors');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX doctors_user_id_unique',
    );
    expect(migration).toContain('WHERE user_id IS NOT NULL');
  });
});
