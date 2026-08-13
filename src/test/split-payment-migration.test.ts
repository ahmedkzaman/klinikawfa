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
const stress = readFileSync(resolve(
  process.cwd(),
  'stress-tests/phase-b/settle-debt-race.k6.js',
), 'utf8');

function functionBody(name: string, parameterMarker?: string): string {
  const definitions = Array.from(sql.matchAll(new RegExp(
    `create(?: or replace)? function public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns jsonb[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`,
    'gi',
  )));
  const definition = parameterMarker
    ? definitions.find((match) => match[1].includes(parameterMarker))
    : definitions.at(-1);
  return definition?.[2] ?? '';
}

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
    expect(sql).toMatch(/revoke all on function public\.ensure_panel_claim_for_queue\(uuid\) from service_role/i);
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
    expect(sql).toMatch(/update public\.payments[\s\S]*deleted_at\s*=\s*now\(\)[\s\S]*deleted_by\s*=\s*v_actor/i);
    expect(sql).toMatch(/record_payment_and_complete_visit[\s\S]*SET search_path = pg_catalog, public/i);
    expect(sql).toMatch(/v_payment_method NOT IN \('cash', 'qr_pay', 'card', 'transfer', 'panel'\)/i);
    expect(sql).not.toMatch(/interval '10 seconds'/i);
  });

  it('correlates split tenders to a receipt batch and hardens payment-only settlement', () => {
    expect(sql).toMatch(/alter table public\.payments add column batch_id uuid/i);
    expect(sql).toMatch(/insert into public\.payments \(\s*batch_id,[\s\S]*?values \(\s*v_batch\.id,/i);
    expect(sql).toMatch(/revoke all on function public\.settle_multiple_debts_legacy_core[\s\S]*service_role/i);
    expect(sql).toMatch(/v_qe\.visit_type::text\s*<>\s*'payment_only'[\s\S]*v_qe\.clinic_status::text\s*<>\s*'sent_to_dispensary'/i);
    expect(sql).not.toMatch(/grant execute on function public\.settle_multiple_debts\([^;]+service_role/i);
    expect(sql).toContain('PAYMENT_CONSULTATION_MISMATCH');
    expect(sql).toContain('PAYMENT_BATCH_MISMATCH');
    expect(sql).toMatch(/create trigger reconcile_cached_panel_payment after insert/i);
    expect(sql).toMatch(/p_new_amount = 0[\s\S]*delete from public\.panel_claim_portions/i);
    expect(sql).toMatch(/can_correct_completed_bill\(v_actor\)[\s\S]*PANEL_CLAIM_ALREADY_MATERIALIZED/i);
    expect(sql).toMatch(/v_visit_type = 'payment_only'[\s\S]*v_consultation_patient <> v_queue_patient/i);
    expect(sql).toMatch(/settle_multiple_debts\([\s\S]*p_idempotency_key uuid[\s\S]*can_checkout_visit\(v_actor_id\)/i);
    expect(sql).toMatch(/insert into public\.payments\s*\([\s\S]*batch_id[\s\S]*v_batch\.id/i);
    expect(sql).toMatch(/'batch_id'\s*,\s*v_batch\.id[\s\S]*'payment_ids'\s*,\s*v_ids/i);
    expect(sql).not.toMatch(/return public\.settle_multiple_debts_legacy_core/i);
  });

  it('stores debt batches against a coordinator while posting every tender to its original visit ledger', () => {
    const debt = functionBody('settle_multiple_debts', 'p_idempotency_key uuid');
    expect(sql).toMatch(/coordination_queue_entry_id uuid[\s\S]*references public\.queue_entries\(id\)/i);
    expect(sql).toMatch(/check\s*\(\s*\(queue_entry_id is not null\)[\s\S]*coordination_queue_entry_id is not null/i);
    expect(debt).toMatch(/coordination_queue_entry_id[\s\S]*p_queue_entry_id/i);
    expect(debt).toMatch(
      /insert into public\.payments\s*\([\s\S]*queue_entry_id[\s\S]*consultation_id[\s\S]*\)[\s\S]*values\s*\([\s\S]*v_row\.queue_entry_id[\s\S]*v_row\.consultation_id/i,
    );
    expect(debt).not.toMatch(/values\s*\([^;]*p_queue_entry_id\s*,\s*v_row\.consultation_id/i);
    expect(debt).toMatch(/panel_claims[\s\S]*status::text in \('pending','submitted','approved','received'\)/i);
    expect(debt).toMatch(/panel_covered[\s\S]*outstanding/i);
    expect(sql).toMatch(/selected_queue_entry_ids uuid\[\] not null/i);
    expect(debt).toMatch(/selected_queue_entry_ids[\s\S]*v_original_queue_ids/i);
  });

  it('recovers a keyed debt replay before rejecting the now-completed coordinator', () => {
    const debt = functionBody('settle_multiple_debts', 'p_idempotency_key uuid');
    const replay = debt.indexOf('IF v_batch.result IS NOT NULL THEN');
    const status = debt.search(/v_qe\.clinic_status::text\s*<>\s*'sent_to_dispensary'/i);
    expect(replay).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(status);
    expect(debt).not.toMatch(/created_at\s*>|interval\s+'[^']+'/i);
  });

  it('uses the shared advisory boundary and deterministic original-ledger locks for debt settlement', () => {
    const debt = functionBody('settle_multiple_debts', 'p_idempotency_key uuid');
    expect(debt).toContain('PERFORM public.lock_completed_bill_item_mutation_boundary()');
    expect(debt).toMatch(/from public\.queue_entries[\s\S]*order by[\s\S]*for update/i);
    expect(debt).toMatch(/from public\.consultations[\s\S]*order by[\s\S]*for update/i);
    expect(debt).toMatch(/from public\.consultation_items[\s\S]*order by[\s\S]*for update/i);
    expect(debt).toMatch(/from public\.payments[\s\S]*order by[\s\S]*for update/i);
  });

  it('qualifies pgcrypto hashing and normalizes cached Panel: Provider markers', () => {
    expect(sql).toContain('extensions.digest(');
    const guard = sql.match(
      /create or replace function private\.validate_payment_insert[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(guard).toMatch(/v_method like 'panel:%'/i);
    expect(guard).toMatch(/insurance_providers[\s\S]*lower\(btrim\(provider\.name\)\)/i);
    expect(guard).toMatch(/new\.payment_method\s*:=\s*'panel'/i);
  });

  it('allows pending unreceived portions to rebalance securely and cleans them up at zero', () => {
    const completed = functionBody('record_split_payments');
    const guard = sql.match(
      /create or replace function private\.validate_payment_insert[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(completed).not.toMatch(
      /panel_claim_already_materialized[\s\S]*exists\s*\(select 1 from public\.panel_claim_portions/i,
    );
    expect(guard).not.toMatch(
      /or exists \(select 1 from public\.panel_claim_portions portion/i,
    );
    const reconciler = sql.match(
      /create or replace function private\.rebalance_panel_claim_portions[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const ensure = sql.match(
      /create or replace function public\.ensure_panel_claim_for_queue[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const parentGuard = sql.match(
      /create or replace function private\.guard_panel_claim_split_parent_mutation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(ensure).toMatch(/private\.panel_claim_split_correction_context[\s\S]*update public\.panel_claims/i);
    expect(reconciler).toMatch(/p_new_amount = 0[\s\S]*delete from public\.panel_claim_portions[\s\S]*panel_claim_portion_audit/i);
    expect(reconciler).toMatch(/payment_reference is not null[\s\S]*received_date is not null/i);
    expect(ensure).toMatch(/panel_claim_is_materialized[\s\S]*PANEL_CLAIM_ALREADY_MATERIALIZED/i);
    expect(ensure).not.toContain('coalesce(auth.uid(), v_patient_id)');
    expect(parentGuard).toMatch(/new\.amount > 0[\s\S]*v_portion_received = new\.amount/i);
    expect(harness).toContain('PENDING_PANEL_PORTION_RECONCILIATION_MISMATCH');
    expect(harness).toContain('ZERO_PANEL_PORTION_CLEANUP_MISMATCH');
  });

  it('executes both debt overloads through the authenticated SQL harness', () => {
    expect(harness).toMatch(/public\.settle_multiple_debts\([\s\S]*DEBT_KEYED_REPLAY_MISMATCH/i);
    expect(harness).toContain('DEBT_LEGACY_OVERLOAD_MISMATCH');
    expect(harness).toContain('DEBT_ORIGINAL_QUEUE_ATTRIBUTION_MISMATCH');
    expect(harness).toContain('DEBT_WRONG_PATIENT_REJECTION_MISSED');
    expect(harness).toContain('PAYMENT_BATCH_APPEND_REJECTION_MISSED');
    const afterRole = harness.slice(harness.indexOf('SET LOCAL ROLE authenticated'));
    expect(afterRole).not.toMatch(/insert into public\.panel_claim_portions/i);
  });

  it('keeps the debt race script keyed and limited to supported authentication and outcomes', () => {
    expect(stress).toContain('p_idempotency_key');
    expect(stress).toContain('__ENV.IDEMPOTENCY_KEY');
    expect(stress).toContain('__ENV.AUTH_TOKEN');
    expect(stress).toContain('__ENV.ANON_KEY');
    expect(stress).not.toContain('SERVICE_KEY');
    expect(stress).not.toMatch(/ALREADY_COMPLETED|OVERPAYMENT/);
    expect(stress).toMatch(/STALE_PATIENT_OUTSTANDING|INVALID_PAYMENT_ONLY_STATUS|IDEMPOTENCY_KEY_CONFLICT/);
  });

  it('keeps RPC-only ledgers and debt overloads unavailable to service_role', () => {
    expect(sql).toMatch(/revoke all on table public\.payment_batches from service_role/i);
    expect(sql).toMatch(/revoke all on table public\.payment_void_audit from service_role/i);
    expect(sql).toMatch(/alter table public\.payment_void_audit owner to postgres/i);
    for (const triggerFunction of [
      'validate_payment_insert',
      'reconcile_cached_panel_payment',
      'prevent_payment_void_audit_change',
    ]) {
      expect(sql).toMatch(new RegExp(
        `alter function private\\.${triggerFunction}\\(\\) owner to postgres[\\s\\S]*?revoke all on function private\\.${triggerFunction}\\(\\)\\s+from public, anon, authenticated, service_role`,
        'i',
      ));
    }
    expect(sql).toMatch(
      /revoke all on function public\.settle_multiple_debts\(uuid, uuid\[\], numeric, text, text\)\s+from public, anon, service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.settle_multiple_debts\(uuid,uuid\[\],numeric,text,text,uuid\) from public,anon,service_role/i,
    );
    for (const signature of [
      'void_payment_portion\\(uuid, text\\)',
      'record_split_payments_and_complete_visit\\([\\s\\S]*?uuid,uuid,text,numeric,jsonb,uuid,text,uuid[\\s\\S]*?\\)',
      'record_split_payments\\([\\s\\S]*?uuid,uuid,text,jsonb,text,uuid[\\s\\S]*?\\)',
      'checkout_visit\\([\\s\\S]*?uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text, numeric, jsonb, uuid[\\s\\S]*?\\)',
      'record_payment_and_complete_visit\\([\\s\\S]*?uuid, uuid, text, text, numeric, text[\\s\\S]*?\\)',
    ]) {
      expect(sql).toMatch(new RegExp(
        `revoke all on function public\\.${signature}\\s+from public(?:, anon|[\\s\\S]*?from anon)[\\s\\S]*?from service_role`,
        'i',
      ));
    }
  });

  it('exposes least-privilege financial snapshots for authorized billing workflows', () => {
    expect(sql).toMatch(/create function public\.get_visit_financial_snapshot\(p_queue_entry_id uuid\)/i);
    expect(sql).toMatch(/create function public\.get_patient_debt_snapshot\(p_patient_id uuid\)/i);
    expect(sql).toMatch(/create function public\.get_payment_batch_receipt\(p_payment_id uuid\)/i);
    expect(sql).toMatch(/can_checkout_visit\(auth\.uid\(\)\)[\s\S]*not_authorized/i);
    expect(sql).toMatch(/grant execute on function public\.get_visit_financial_snapshot\(uuid\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.get_patient_debt_snapshot\(uuid\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.get_payment_batch_receipt\(uuid\) to authenticated/i);
    expect(sql).toMatch(/get_payment_batch_receipt[\s\S]*'selected_queue_entry_ids'[\s\S]*'ledger_payments'/i);
  });

  it('limits past-debt snapshots and settlement to completed historical ledgers', () => {
    const snapshot = functionBody('get_patient_debt_snapshot');
    const debt = functionBody('settle_multiple_debts', 'p_idempotency_key uuid');
    expect(snapshot.match(/queue\.clinic_status::text = 'completed'/gi)).toHaveLength(4);
    expect(debt.match(/original_queue\.clinic_status::text = 'completed'/gi)).toHaveLength(2);
  });

  it('prevents cached inserts from appending to durable RPC batches', () => {
    const guard = sql.match(
      /create or replace function private\.validate_payment_insert[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(guard).toMatch(/new\.batch_id is not null[\s\S]*batch_write_context/i);
    expect(guard).toMatch(/PAYMENT_BATCH_WRITE_FORBIDDEN/i);
    expect(sql).toMatch(/create table private\.payment_batch_write_context/i);
    expect(sql.match(/insert into private\.payment_batch_write_context/gi)).toHaveLength(3);
    expect(sql.match(/delete from private\.payment_batch_write_context/gi)).toHaveLength(3);
  });

  it('covers corrected quantity-three billing and production split-parent trigger behavior', () => {
    expect(harness).toMatch(/TEST ONLY PANEL SAVED QUANTITY', 3, 10[\s\S]*000000000402', 2/i);
    expect(harness).toContain('SAVED_BILLED_QUANTITY_30_MISMATCH');
    expect(harness).toContain('guard_panel_claim_split_parent_mutation');
    expect(harness).toContain('void_payment_portion');
    expect(harness.indexOf('CREATE FUNCTION public.test_only_seed_panel_claim_portion'))
      .toBeLessThan(harness.indexOf('SET LOCAL ROLE authenticated'));
    expect(harness).toMatch(/public\.checkout_visit\([\s\S]*30, 30, 'cash'[\s\S]*RETAINED_CHECKOUT_SAVED_QUANTITY_30_MISMATCH/i);
    expect(harness).toMatch(/test_only_seed_panel_claim_portion[\s\S]*values\s*\(1\),\s*\(2\)/i);
    expect(harness).toContain('SET CONSTRAINTS ALL IMMEDIATE');
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

  it('uses valid PL/pgSQL statement terminators in the migration and executable fixture', () => {
    expect(sql).not.toMatch(/\nEND\r?\n\$function\$;/);
    expect(harness).not.toMatch(/\nEND\r?\n\$(?:setup|verify)\$;/);
  });
});
