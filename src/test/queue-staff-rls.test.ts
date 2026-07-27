import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260727160000_restore_internal_staff_queue_visibility.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('queue visibility RLS', () => {
  it.each(['ops_staff', 'staff_nurse', 'purchaser'])(
    'recognizes %s as internal staff',
    (role) => {
      expect(migration).toContain(`'${role}'`);
    },
  );

  it('uses the shared staff helper for queue reads', () => {
    expect(migration).toContain('public.is_internal_staff((SELECT auth.uid()))');
    expect(migration).toContain('FOR SELECT');
    expect(migration).toContain('deleted_at IS NULL');
  });
});
