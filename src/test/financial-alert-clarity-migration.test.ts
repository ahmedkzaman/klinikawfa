import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function migrationSql(): string {
  const directory = resolve(process.cwd(), 'supabase/migrations');
  const filename = readdirSync(directory).find((name) => (
    name.endsWith('_clarify_financial_alerts.sql')
  ));

  expect(filename).toBeDefined();
  return readFileSync(resolve(directory, filename!), 'utf8');
}

describe('financial alert clarity migration', () => {
  it('does not classify ordinary outstanding balances as payment mismatches', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/rename to financial_control_report_rows_before_alert_clarity/i);
    expect(sql).toMatch(/create or replace function private\.financial_control_report_rows\s*\(/i);
    expect(sql).toMatch(/key_value\s*<>\s*'payment_mismatch'/i);
    expect(sql).toMatch(/abs\(report\.billed\s*-\s*report\.paid_to_date\s*-\s*report\.outstanding\)\s*>\s*0\.01/i);
    expect(sql).toMatch(/not\s*\(\s*'duplicate_or_excess_payment'\s*=\s*any\(report\.alert_keys\)\s*\)/i);
    expect(sql).toMatch(/not\s*\(\s*'unsubmitted_panel'\s*=\s*any\(report\.alert_keys\)\s*\)/i);
    expect(sql).toMatch(/not\s*\(\s*'overdue_panel'\s*=\s*any\(report\.alert_keys\)\s*\)/i);
  });

  it('keeps the wrapper private and preserves invoker authorization', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/revoke all on function private\.financial_control_report_rows\(date,date,date\)\s+from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function private\.financial_control_report_rows_before_alert_clarity\(date,date,date\)\s+from public, anon, authenticated/i);
  });
});
