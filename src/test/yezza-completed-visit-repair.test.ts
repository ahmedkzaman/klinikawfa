import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260807040412_complete_yezza_legacy_visits.sql'),
  'utf8',
);

describe('Yezza legacy visit completion repair', () => {
  it('completes only source-linked Yezza visits without firing live workflow triggers', () => {
    expect(migration).toMatch(/begin;/i);
    expect(migration).toMatch(/set local session_replication_role = replica;/i);
    expect(migration).toMatch(/from public\.visit_external_ids[\s\S]*source_system = 'yezza'/i);
    expect(migration).toMatch(/update public\.consultations[\s\S]*status = 'completed'/i);
    expect(migration).toMatch(/entry_source = 'legacy_import'/i);
    expect(migration).toMatch(/update public\.queue_entries[\s\S]*clinic_status = 'completed'/i);
    expect(migration).toMatch(/set local session_replication_role = origin;/i);
    expect(migration).toMatch(/raise exception 'YEZZA_LEGACY_VISIT_REPAIR_INCOMPLETE'/i);
    expect(migration).toMatch(/commit;/i);
  });
});
