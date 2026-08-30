import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260829233055_add_remedi_financial_event_historical_attribution.sql',
);

describe('Remedi financial event historical attribution migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('uses the repo-sanctioned repair pattern: disable immutable trigger, repair, re-enable', () => {
    // Trigger names verified live 2026-08-29: prevent_financial_visit_completion_event_change
    // (singular "event") and prevent_financial_panel_claim_event_change.
    for (const trigger of [
      'prevent_financial_visit_completion_event_change',
      'prevent_financial_panel_claim_event_change',
    ]) {
      expect(sql).toContain(`DISABLE TRIGGER ${trigger};`);
      expect(sql).toContain(`ENABLE TRIGGER ${trigger};`);
    }
  });

  it('repairs imported completion events to Remedi attendance time via queue_entries, never statement time', () => {
    // UPDATE must join through the visit queue entry and set completed_at from
    // the queue's historical created_at (Remedi visit_date, MYT).
    expect(sql).toMatch(
      /UPDATE private\.financial_visit_completion_events AS event\s+SET completed_at = q\.created_at/s,
    );
    expect(sql).toContain("q.visit_type IN ('historical_import', 'payment_only')");
    // Repaired rows are marked inferred from the source timestamp, not 'recorded'.
    expect(sql).toContain("'inferred_source_timestamp'");
  });

  it('repairs imported claim_created events and restores zero-price package child events', () => {
    expect(sql).toMatch(
      /UPDATE private\.financial_panel_claim_events AS event\s+SET occurred_at = claim\.claim_date/s,
    );
    expect(sql).toContain(
      'INSERT INTO private.financial_zero_price_package_child_events',
    );
    // Imported visits are terminal completed and have zero void events, so no
    // void insertion must be attempted.
    expect(sql).not.toMatch(/'void'/);
  });

  it('deletes only orphaned event rows whose visits were retired, backed up first', () => {
    expect(sql).toContain('private.remedi_orphan_financial_events_backup');
    expect(sql).toMatch(
      /DELETE FROM private\.financial_visit_completion_events event[\s\S]*?NOT EXISTS \(\s*SELECT 1 FROM public\.queue_entries q WHERE q\.id = event\.queue_entry_id\s*\)/,
    );
    expect(sql).toMatch(
      /DELETE FROM private\.financial_panel_claim_events event[\s\S]*?NOT EXISTS \(\s*SELECT 1 FROM public\.queue_entries q WHERE q\.id = event\.queue_entry_id\s*\)/,
    );
    expect(sql).toMatch(
      /DELETE FROM private\.financial_payment_events event[\s\S]*?NOT EXISTS \(\s*SELECT 1 FROM public\.queue_entries q WHERE q\.id = event\.queue_entry_id\s*\)/,
    );
  });

  it('is idempotent and fails closed with a verification gate', () => {
    expect(sql).toContain('REMEDI_FINANCIAL_EVENT_ATTRIBUTION_FAILED');
    expect(sql).toMatch(/CREATE TABLE private\.remedi_orphan_financial_events_backup/);
  });

  it('notifies PostgREST to reload the schema after repair', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
