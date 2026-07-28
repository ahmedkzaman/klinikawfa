import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260725012600_fix_zero_panel_pricing_and_financial_cogs.sql',
  ),
  'utf8',
);
const completedBillReportingMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260728153000_reconcile_completed_bill_financial_reporting.sql',
  ),
  'utf8',
);
const triggerSecurityMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260725013204_restrict_selling_price_trigger_execution.sql',
  ),
  'utf8',
);

describe('financial COGS and panel pricing migration', () => {
  it('treats zero catalog tiers as unset and falls back to the standard panel price', () => {
    expect(migration).toMatch(/NULLIF\(v_tier_price,\s*0\)/i);
    expect(migration).toMatch(
      /NEW\.price\s*:=\s*COALESCE\(\s*v_override,\s*NULLIF\(v_tier_price,\s*0\),\s*v_standard,\s*v_self_pay,\s*0\s*\)/i,
    );
  });

  it('keeps the legacy financial view available before the correction follow-up migration', () => {
    expect(migration).toContain(
      "(c.status = 'completed' OR qe.clinic_status = 'completed')",
    );
    expect(migration).toMatch(
      /ci\.unit_cost\s*\*\s*COALESCE\(ci\.dispensed_qty,\s*ci\.quantity\)/i,
    );
    expect(migration).toMatch(
      /ci\.price\s*\*\s*COALESCE\(ci\.dispensed_qty,\s*ci\.quantity\)/i,
    );
  });

  it('reports corrected completed bills at billed quantity while preserving COGS', () => {
    expect(completedBillReportingMigration).toMatch(
      /ci\.price\s*\*\s*ci\.quantity/i,
    );
    expect(completedBillReportingMigration).toMatch(
      /ci\.unit_cost\s*\*\s*ci\.quantity/i,
    );
    expect(completedBillReportingMigration).not.toMatch(/dispensed_qty/i);
    expect(completedBillReportingMigration).toMatch(/ci\.deleted_at is null/i);
  });

  it('keeps the financial view subject to caller RLS', () => {
    expect(migration).toContain('WITH (security_invoker = true)');
  });

  it('does not expose the internal pricing trigger as an RPC', () => {
    expect(triggerSecurityMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.trg_resolve_selling_price\(\) FROM PUBLIC/i,
    );
    expect(triggerSecurityMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.trg_resolve_selling_price\(\) FROM anon,\s*authenticated/i,
    );
  });
});
