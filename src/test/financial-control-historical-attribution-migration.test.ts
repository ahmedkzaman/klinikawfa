import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260804080000_infer_historical_financial_completion_dates.sql',
);

describe('historical financial completion attribution migration', () => {
  it('adds an auditable inferred event without rewriting the original backfill event', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('INSERT INTO private.financial_visit_completion_events');
    expect(sql).toContain("legacy.provenance = 'synthetic_backfill'");
    expect(sql).toContain("'inferred_queue_updated_at'");
    expect(sql).toContain('queue.updated_at');
    expect(sql).toContain('private.financial_control_completion_item_state(legacy.consultation_id)');
    expect(sql).toContain('DROP CONSTRAINT financial_visit_completion_events_provenance_check');
    expect(sql).toContain('DROP CONSTRAINT financial_visit_completion_events_check');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).not.toMatch(/UPDATE\s+private\.financial_visit_completion_events/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+private\.financial_visit_completion_events/i);
  });
});
