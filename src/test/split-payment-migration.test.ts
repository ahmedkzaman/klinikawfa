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

  it('takes the shared advisory boundary before either batch row lock', () => {
    const active = sql.match(
      /create or replace function public\.record_split_payments_and_complete_visit[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const completed = sql.match(
      /create or replace function public\.record_split_payments\([\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    for (const rpc of [active, completed]) {
      expect(rpc.indexOf('PERFORM public.lock_completed_bill_item_mutation_boundary()'))
        .toBeLessThan(rpc.indexOf('INSERT INTO public.payment_batches'));
    }
  });

  it('uses effective dispensed quantity and rejects unsafe completed panel claims', () => {
    const effectiveQuantity = /item\.price \* case[\s\S]*?item\.item_id is not null[\s\S]*?coalesce\(item\.dispensed_qty, item\.quantity\)[\s\S]*?else item\.quantity/gi;
    expect(sql.match(effectiveQuantity)).toHaveLength(2);
    expect(sql).toMatch(/select claim\.status::text[\s\S]*for update[\s\S]*v_panel_claim_status is distinct from 'pending'[\s\S]*PANEL_CLAIM_NOT_PENDING/i);
  });

  it('fingerprints the complete canonical request and bounds aggregate amounts', () => {
    expect(sql).toMatch(/request_fingerprint text not null/i);
    for (const field of [
      'consultation_id',
      'provider_id',
      'notes',
      'payments',
    ]) {
      expect(sql).toContain(`'${field}'`);
    }
    expect(sql).toMatch(/request_fingerprint is distinct from v_request_fingerprint/i);
    expect(sql.match(/v_allocation_total > 9999999999\.99/g)).toHaveLength(2);
  });
});
