import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('doctor clinical activity report migration', () => {
  it('defines the protected doctor-attributed activity RPC', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260728102430_add_doctor_clinical_activity_report.sql',
      ),
      'utf8',
    );

    expect(sql).toMatch(/get_doctor_clinical_activity\s*\(\s*_start_date date,\s*_end_date date/i);
    expect(sql).toContain('can_view_insights');
    expect(sql).toMatch(/c\.doctor_id/i);
    expect(sql).not.toMatch(/cd\.created_by\s+as\s+doctor_id/i);
    expect(sql).toMatch(/s\.category\s*=\s*'Procedure'/i);
    expect(sql).toMatch(/ci\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/c\.status\s*=\s*'completed'/i);
    expect(sql).toMatch(/lower\(coalesce\(cd\.type,\s*''\)\)\s+in\s*\('mc',\s*'quarantine',\s*'referral'\)/i);
    expect(sql).toMatch(/revoke all on function[\s\S]*from public/i);
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated/i);
  });
});
