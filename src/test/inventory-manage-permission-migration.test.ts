import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationName = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('_inventory_manage_permission.sql'))
  .sort()
  .at(-1);

if (!migrationName) throw new Error('inventory.manage migration not found');
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);

describe('inventory.manage permission migration', () => {
  it('seeds role defaults for every app role', () => {
    expect(sql).toMatch(
      /insert into public\.clinic_role_permissions\s*\(role, permission_key, allowed\)/i,
    );
    expect(sql).toMatch(/on conflict \(role, permission_key\) do nothing/i);
    for (const role of [
      'admin',
      'special_admin',
      'doctor_admin',
      'operations',
      'ops_staff',
      'purchaser',
      'staff_nurse',
      'staff',
      'resident_doctor',
      'locum',
      'guest',
      'website_editor',
    ]) {
      expect(sql).toContain(`'${role}'`);
    }
    expect((sql.match(/'inventory\.manage', true\)/g) ?? []).length).toBe(7);
    expect((sql.match(/'inventory\.manage', false\)/g) ?? []).length).toBe(5);
  });

  it('redefines can_manage_inventory to consult the permission matrix', () => {
    expect(sql).toMatch(
      /create or replace function public\.can_manage_inventory\(_user_id uuid\)/i,
    );
    expect(sql).toMatch(/has_clinic_permission\('inventory\.manage'/i);
    // hard floor: clinical-excluded roles never manage inventory
    expect(sql).toMatch(
      /'resident_doctor'\s*,\s*'locum'\s*,\s*'guest'|\('resident_doctor','locum','guest'\)/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/stable/i);
  });

  it('locks the function down to authenticated', () => {
    expect(sql).toMatch(/revoke all on function public\.can_manage_inventory\(uuid\) from public/i);
    expect(sql).toMatch(
      /grant execute on function public\.can_manage_inventory\(uuid\) to authenticated/i,
    );
  });
});
