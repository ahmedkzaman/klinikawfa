import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260804081000_infer_historical_cash_and_claim_dates.sql',
);

describe('historical financial cash attribution migration', () => {
  it('uses source timestamps and confines mutation to synthetic backfill rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('prevent_financial_payment_event_change');
    expect(sql).toContain('prevent_financial_panel_claim_event_change');
    expect(sql).toContain("legacy.provenance = 'synthetic_backfill'");
    expect(sql).toContain("'inferred_source_timestamp'");
    expect(sql).toContain('payment.created_at');
    expect(sql).toContain('claim.created_at');
    expect(sql).toContain('HISTORICAL_PAYMENT_ATTRIBUTION_INCOMPLETE');
    expect(sql).toContain('HISTORICAL_CLAIM_ATTRIBUTION_INCOMPLETE');
  });
});
