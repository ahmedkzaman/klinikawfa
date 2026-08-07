import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy completed bill status repair', () => {
  it('completes only consultations whose queues are already completed without replaying side effects', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_repair_legacy_completed_bill_status.sql'));

    expect(migration).toBeDefined();
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(/disable trigger consultations_inventory_au/i);
    expect(sql).toMatch(/disable trigger after_update_generate_panel_claim/i);
    expect(sql).toMatch(/disable trigger capture_financial_visit_completion_from_consultation/i);
    expect(sql).toMatch(/update public\.consultations[\s\S]*status = 'completed'/i);
    expect(sql).toMatch(/qe\.clinic_status = 'completed'/i);
    expect(sql).toMatch(/c\.status is distinct from 'completed'/i);
    expect(sql).toMatch(/enable trigger consultations_inventory_au/i);
    expect(sql).toMatch(/enable trigger after_update_generate_panel_claim/i);
    expect(sql).toMatch(/enable trigger capture_financial_visit_completion_from_consultation/i);
  });
});
