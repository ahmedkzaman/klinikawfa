import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('clinic health metrics migration', () => {
  it('defines a protected inclusive-date RPC with all executive metric keys', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260726100000_add_clinic_health_metrics.sql'), 'utf8');
    expect(sql).toMatch(/get_clinic_health_metrics\s*\(/i);
    expect(sql).toMatch(/is_staff_or_admin\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/_start_date/i);
    expect(sql).toMatch(/_end_date/i);
    for (const key of ['financial', 'visits', 'claims', 'panelFees', 'inventory', 'dataQuality']) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it('counts active panels from the real status column, not a removed is_active column', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260729100212_fix_clinic_health_panel_status.sql',
      ),
      'utf8',
    );

    expect(sql).toMatch(
      /insurance_providers\s+WHERE\s+status\s*=\s*'active'/i,
    );
    expect(sql).not.toMatch(
      /insurance_providers\s+WHERE\s+is_active/i,
    );
  });
});
