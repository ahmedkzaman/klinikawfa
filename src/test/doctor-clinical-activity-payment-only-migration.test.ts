import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260817170000_exclude_payment_only_doctor_activity.sql',
), 'utf8');

describe('doctor clinical activity payment-only remediation', () => {
  it('filters the public detail and CSV rowset through the authoritative queue visit type', () => {
    expect(sql).toMatch(/join public\.queue_entries as queue_entry[\s\S]*queue_entry\.id = activity\.queue_entry_id/i);
    expect(sql).toMatch(/where queue_entry\.visit_type <> 'payment_only'/i);
  });

  it('preserves the secured RPC boundary while making the previous implementation private', () => {
    expect(sql).toMatch(/language sql[\s\S]*stable[\s\S]*security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
    expect(sql).toMatch(/_get_doctor_clinical_activity_before_payment_only_filter\(date, date\)[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.get_doctor_clinical_activity\(date, date\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_doctor_clinical_activity\(date, date\) to authenticated/i);
  });
});
