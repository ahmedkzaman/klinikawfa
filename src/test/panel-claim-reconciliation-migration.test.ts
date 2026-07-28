import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260728093000_reconcile_panel_claims_on_checkout.sql',
);

describe('panel claim checkout reconciliation migration', () => {
  test('creates or refreshes a pending claim from all active consultation items', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('ensure_panel_claim_for_queue');
    expect(migration).toMatch(/SUM\(ci\.price \* ci\.quantity\)/i);
    expect(migration).toMatch(/pc\.status = 'pending'/i);
    expect(migration).toMatch(/SET amount = v_total_amount/i);
  });

  test('covers both consultation and queue completion paths idempotently', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('after_queue_completion_ensure_panel_claim');
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*queue_entry_id/i);
    expect(migration).toMatch(/ON CONFLICT \(queue_entry_id\)/i);
  });

  test('repairs completed panel queues whose consultations were left in progress', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/UPDATE public\.consultations c[\s\S]*SET status = 'completed'/i);
    expect(migration).toMatch(/qe\.clinic_status = 'completed'/i);
    expect(migration).toMatch(/qe\.payment_method = 'panel'/i);
  });
});
