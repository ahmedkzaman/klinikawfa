import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260812174507_add_split_patient_payments.sql',
), 'utf8');
const harness = readFileSync(resolve(
  process.cwd(),
  'supabase/tests/completed_bill_corrections.sql',
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

  it('uses saved billed quantity and rejects unsafe completed panel claims', () => {
    expect(sql).not.toContain('dispensed_qty');
    expect(sql.match(/item\.price \* item\.quantity/gi)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/select claim\.status::text[\s\S]*for update[\s\S]*v_panel_claim_status is distinct from 'pending'[\s\S]*PANEL_CLAIM_NOT_PENDING/i);
  });

  it('replaces retained checkout_visit with the saved quantity basis', () => {
    const retained = sql.match(/create or replace function public\.checkout_visit[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(retained).toContain('item.price * item.quantity');
    expect(retained).not.toContain('dispensed_qty');
    expect(harness).toContain('RETAINED_CHECKOUT_SAVED_QUANTITY_30_MISMATCH');
  });

  it('rejects active panel collection once its claim is materialized', () => {
    const active = sql.match(/create or replace function public\.record_split_payments_and_complete_visit[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(active).toMatch(/panel_claims[\s\S]*for update[\s\S]*PANEL_CLAIM_ALREADY_MATERIALIZED/i);
    expect(harness).toContain('MATERIALIZED_ACTIVE_PANEL_SPLIT_SUCCEEDED');
  });

  it('reconciles panel claims through the split-parent correction capability', () => {
    const helper = sql.match(
      /create or replace function public\.ensure_panel_claim_for_queue[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(helper).toMatch(/item\.price \* item\.quantity/i);
    expect(helper).toContain('private.panel_claim_split_correction_context');
    expect(helper).toMatch(/security definer[\s\S]*?set search_path = pg_catalog, public/i);
    expect(sql).toMatch(/revoke all on function public\.ensure_panel_claim_for_queue\(uuid\) from public/i);
    expect(sql).toMatch(/grant execute on function public\.ensure_panel_claim_for_queue\(uuid\) to service_role/i);
  });

  it('only checks out dispensing-payment visits and reports the current stale balance', () => {
    expect(sql).toMatch(/clinic_status::text is distinct from 'dispensing_payment'[\s\S]*INVALID_CHECKOUT_STATUS/i);
    expect(sql).toMatch(/STALE_PATIENT_OUTSTANDING: expected %/i);
  });

  it('uses staged RPC migration without a spoofable GUC and exposes an audited atomic payment void RPC', () => {
    expect(sql).not.toMatch(/create trigger guard_payment_insert[\s\S]*before insert on public\.payments/i);
    expect(sql).toMatch(/lock_completed_bill_item_mutation_boundary/i);
    expect(sql).toMatch(/create table public\.payment_void_audit/i);
    expect(sql).toMatch(/create or replace function public\.void_payment_portion/i);
    expect(sql).toMatch(/grant execute on function public\.void_payment_portion\(uuid, text\) to authenticated/i);
    expect(sql).not.toContain('DIRECT_PAYMENT_INSERT_FORBIDDEN');
    expect(sql).not.toContain('app.authorized_payment_write');
    expect(sql).toMatch(/create trigger validate_payment_insert before insert on public\.payments/i);
    expect(sql).toMatch(/create trigger prevent_payment_void_audit_change/i);
    expect(sql).toMatch(/can_correct_completed_bill\(v_actor\)/i);
    expect(sql).toMatch(/record_payment_and_complete_visit[\s\S]*SET search_path = pg_catalog, public/i);
    expect(sql).toMatch(/v_payment_method NOT IN \('cash', 'qr_pay', 'card', 'transfer', 'panel'\)/i);
    expect(sql).not.toMatch(/interval '10 seconds'/i);
  });

  it('correlates split tenders to a receipt batch and hardens payment-only settlement', () => {
    expect(sql).toMatch(/alter table public\.payments add column batch_id uuid/i);
    expect(sql).toMatch(/insert into public\.payments \(\s*batch_id,[\s\S]*?values \(\s*v_batch\.id,/i);
    expect(sql).toMatch(/revoke all on function public\.settle_multiple_debts_legacy_core[\s\S]*service_role/i);
    expect(sql).toMatch(/v_qe\.visit_type <> 'payment_only' or v_qe\.status <> 'sent_to_dispensary'/i);
  });

  it('covers corrected quantity-three billing and production split-parent trigger behavior', () => {
    expect(harness).toMatch(/TEST ONLY PANEL SAVED QUANTITY', 3, 10[\s\S]*000000000402', 2/i);
    expect(harness).toContain('SAVED_BILLED_QUANTITY_30_MISMATCH');
    expect(harness).toContain('guard_panel_claim_split_parent_mutation');
    expect(harness).toContain('void_payment_portion');
    expect(harness.indexOf('CREATE FUNCTION public.test_only_seed_panel_claim_portion'))
      .toBeLessThan(harness.indexOf('SET LOCAL ROLE authenticated'));
    expect(harness).toMatch(/public\.checkout_visit\([\s\S]*30, 30, 'cash'[\s\S]*RETAINED_CHECKOUT_SAVED_QUANTITY_30_MISMATCH/i);
  });

  it('keeps the eight-column completed-panel fixture at eight values', () => {
    expect(harness).toMatch(
      /id, consultation_id, item_name, quantity, price, unit_cost,\s*item_id, dispensed_qty\s*\)\s*values\s*\(\s*'70000000-0000-4000-8000-000000000504',[\s\S]*?1, 100, 20, null, null\s*\)/i,
    );
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
