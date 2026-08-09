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

  it('runs the staff-authorized aggregate without per-row RLS overhead', () => {
    const guardedFunctionSql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260804120000_add_panel_claim_payment_portions.sql',
      ),
      'utf8',
    );
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260809130000_optimize_clinic_health_metrics_rls.sql',
      ),
      'utf8',
    );

    expect(sql).toMatch(/get_clinic_health_metrics\s*\([^)]*\)[\s\S]*security definer/i);
    expect(guardedFunctionSql).toMatch(/is_staff_or_admin\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/revoke all on function[\s\S]*from public/i);
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated/i);
  });
});
