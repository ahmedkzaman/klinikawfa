import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260816015642_inactivate_non_doctor_staff_from_doctor_lists.sql'),
  'utf8',
);

describe('non-doctor staff doctor-list migration', () => {
  it('inactivates the requested staff doctor rows without deleting history', () => {
    expect(migration).toMatch(/UPDATE\s+public\.doctors/is);
    expect(migration).toMatch(/status\s*=\s*'inactive'/i);
    expect(migration).toMatch(/on_duty\s*=\s*false/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.doctors\b/i);

    for (const name of [
      'siti rozita binti ramli',
      'nurul husna binti ab rahman',
      'nur intan syazwanie',
      'dr. novencia',
      'novencia',
    ]) {
      expect(migration.toLowerCase()).toContain(name);
    }
  });
});
