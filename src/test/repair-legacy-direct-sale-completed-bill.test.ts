import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy Direct Sale completed bill repair', () => {
  it('marks only already-completed OTC direct-sale consultations as completed', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_repair_legacy_direct_sale_completed_consultations.sql'));

    expect(migration).toBeDefined();
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(/update public\.consultations as consultation[\s\S]*set status = 'completed'/i);
    expect(sql).toMatch(/from public\.queue_entries as queue_entry/i);
    expect(sql).toMatch(/consultation\.queue_entry_id = queue_entry\.id/i);
    expect(sql).toMatch(/queue_entry\.clinic_status = 'completed'/i);
    expect(sql).toMatch(/consultation\.status = 'in_progress'/i);
    expect(sql).toMatch(/consultation\.case_note = 'Direct Sale \(OTC counter sale\)'/i);
    expect(sql).toMatch(/consultation\.doctor_id is null/i);
    expect(sql).toMatch(/consultation\.deleted_at is null/i);
    expect(sql).toMatch(/queue_entry\.deleted_at is null/i);
  });
});
