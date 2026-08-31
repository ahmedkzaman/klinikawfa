import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationName = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('_special_admin_manage_permissions.sql'))
  .sort()
  .at(-1);

if (!migrationName) throw new Error('special_admin migration not found');
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);

describe('special_admin manage permissions migration', () => {
  it('grants access.manage_permissions to special_admin as a visible role default', () => {
    expect(sql).toMatch(
      /insert into public\.clinic_role_permissions\s*\(role, permission_key, allowed\)/i,
    );
    expect(sql).toContain("'special_admin'");
    expect(sql).toContain("'access.manage_permissions'");
    expect(sql).toMatch(/,\s*true\s*\)/);
  });

  it('is idempotent and does not touch other roles or keys', () => {
    expect(sql).toMatch(/on conflict \(role, permission_key\) do nothing/i);
    expect(sql).not.toMatch(/update\s+public\.clinic_role_permissions/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.clinic_role_permissions/i);
    expect((sql.match(/'/g) ?? []).length).toBeLessThanOrEqual(6); // role, key, true only
  });
});
