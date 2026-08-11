import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260811093000_separate_patient_payments_from_panel_receivable.sql',
);

describe('panel receivable patient-payment separation migration', () => {
  it('subtracts only non-panel payments from the panel claim amount', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/from public\.payments p/i);
    expect(sql).toMatch(/p\.payment_method\)\) <> 'panel'/i);
    expect(sql).toMatch(/v_total_amount - v_patient_paid/i);
    expect(sql).toMatch(/create or replace function public\.ensure_panel_claim_for_queue/i);
    expect(sql).toMatch(/create or replace function public\.cap_panel_claim_to_patient_balance/i);
    expect(sql).toMatch(/before insert or update of amount, queue_entry_id, status on public\.panel_claims/i);
  });
});
