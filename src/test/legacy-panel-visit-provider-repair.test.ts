import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260805070304_repair_legacy_panel_visit_provider_links.sql',
);

describe('legacy panel visit provider-link repair', () => {
  it('repairs only unambiguous visit-level provider evidence', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("payment.payment_type = 'panel'");
    expect(sql).toContain("substring(payment.notes FROM '(?i)Provider:\\s*(.+)$')");
    expect(sql).toMatch(/lower\(btrim\(provider\.name\)\)[\s\S]*lower\(btrim/is);
    expect(sql).toContain('HAVING COUNT(DISTINCT panel_id) = 1');
    expect(sql).toMatch(/SET payment_method = 'panel',[\s\S]*panel_id = repair\.panel_id/is);
  });

  it('creates one claim per repaired queue visit and restores historical timing', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('public.ensure_panel_claim_for_queue(v_queue_entry_id)');
    expect(sql).toContain('prevent_financial_panel_claim_event_change');
    expect(sql).toMatch(/event_kind = 'claim_created'[\s\S]*event\.occurred_at = repair\.evidence_at/is);
    expect(sql).toContain("provenance = 'inferred_source_timestamp'");
    expect(sql).toContain('LEGACY_PANEL_VISIT_PROVIDER_LINK_REPAIR_INCOMPLETE');
  });
});
