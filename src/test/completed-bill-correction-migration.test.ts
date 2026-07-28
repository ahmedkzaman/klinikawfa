import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('completed bill correction migration', () => {
  it('defines the guarded atomic correction boundary and immutable audit contract', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const matches = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));

    expect(matches).toHaveLength(1);

    const sql = readFileSync(resolve(migrationsDirectory, matches[0]), 'utf8');

    expect(sql).toMatch(/create table public\.completed_bill_correction_audit/i);
    expect(sql).toMatch(
      /alter table public\.completed_bill_correction_audit enable row level security/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.get_completed_bill_correction_context/i,
    );
    expect(sql).toMatch(/create or replace function public\.correct_completed_bill/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/stale_bill/i);
    expect(sql).toMatch(/doctor_admin/i);
    expect(sql).toMatch(/ops_staff/i);
    expect(sql).toMatch(/billing_adjustment_kind/i);
    expect(sql).toMatch(/dispensed_qty/i);
    expect(sql).toMatch(/ensure_panel_claim_for_queue/i);
    expect(sql).toMatch(/before_state/i);
    expect(sql).toMatch(/after_state/i);
    expect(sql).toMatch(
      /revoke all on function public\.correct_completed_bill[\s\S]*from public/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.correct_completed_bill[\s\S]*from anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.correct_completed_bill[\s\S]*to authenticated/i,
    );
  });
});
