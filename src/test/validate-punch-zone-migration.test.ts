import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationName = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('_validate_punch_zone_assignment.sql'))
  .sort()
  .at(-1);

if (!migrationName) throw new Error('punch zone validation migration not found');
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);

describe('punch zone assignment validation migration', () => {
  it('adds a BEFORE INSERT trigger on attendance_records', () => {
    expect(sql).toMatch(/create or replace function public\.validate_punch_zone_assignment\(\)/i);
    expect(sql).toMatch(/create trigger [^\n]*before insert on public\.attendance_records/i);
  });

  it('rejects punches in zones the user is not assigned to for the work date', () => {
    // Must consult both assignment tables for the punch's logical work date.
    expect(sql).toMatch(/roster_zone_assignments/i);
    expect(sql).toMatch(/staff_zone_assignments/i);
    expect(sql).toMatch(/PUNCH_ZONE_MISMATCH|PUNCH_NOT_ASSIGNED/i);
    // Legacy fallback: users with NO assignments at all still punch anywhere.
    expect(sql).toMatch(/no assignment|fallback|allowed when no assignments/i);
  });

  it('revokes the trigger helper from PUBLIC (no direct client influence)', () => {
    expect(sql).toMatch(/revoke all on function public\.validate_punch_zone_assignment\(\) from public/i);
  });
});
