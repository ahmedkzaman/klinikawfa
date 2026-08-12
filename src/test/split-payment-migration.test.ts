import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260812120000_add_split_patient_payments.sql',
), 'utf8');

describe('split payment migration', () => {
  it('defines both authenticated security-definer RPCs', () => {
    expect(sql).toMatch(/create or replace function public\.record_split_payments_and_complete_visit/i);
    expect(sql).toMatch(/create or replace function public\.record_split_payments\(/i);
    expect(sql).toMatch(/can_checkout_visit\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/revoke all[\s\S]*from public[\s\S]*from anon/i);
    expect(sql).toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  it('locks, validates, batches, and completes after inserts', () => {
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/jsonb_array_elements/i);
    expect(sql).toMatch(/idempotency_key/i);
    expect(sql).toMatch(/unique \(queue_entry_id, idempotency_key\)/i);
    expect(sql.indexOf('INSERT INTO public.payments')).toBeLessThan(sql.indexOf("SET clinic_status = 'completed'"));
  });
});
