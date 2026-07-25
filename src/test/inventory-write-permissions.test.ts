import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory write permissions migration', () => {
  it('allows operational roles and denies clinical doctor roles', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260725140000_inventory_write_permissions.sql'),
      'utf8',
    );

    expect(migration).toContain("'purchaser'");
    expect(migration).toContain("'staff_nurse'");
    expect(migration).toContain("'doctor_admin'");
    expect(migration).toContain("role::text NOT IN ('resident_doctor', 'locum', 'guest')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.can_manage_inventory(uuid) FROM PUBLIC');
    expect(migration).toContain('can_manage_inventory');
    expect(migration).toContain('adjust_inventory_batch');
    expect(migration).toContain('add_inventory_batch');
  });
});
