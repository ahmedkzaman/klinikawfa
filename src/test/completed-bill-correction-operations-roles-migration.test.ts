import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260805084503_allow_purchaser_and_staff_nurse_bill_corrections.sql',
);

describe('completed bill correction operation roles migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('grants the guarded correction capability to purchaser and staff nurse', () => {
    const capability = sql.match(
      /create or replace function public\.can_correct_completed_bill[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(capability).toMatch(/'purchaser'/i);
    expect(capability).toMatch(/'staff_nurse'/i);
    expect(capability).toMatch(/from public\.user_roles/i);
    expect(capability).toMatch(/ur\.user_id = _user_id/i);
  });

  it('preserves the restricted function boundary', () => {
    expect(sql).toMatch(
      /revoke all on function public\.can_correct_completed_bill\(uuid\) from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.can_correct_completed_bill\(uuid\) to authenticated/i,
    );
  });
});
