import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260804120000_add_panel_claim_payment_portions.sql',
  'utf8',
);
const generatedTypes = readFileSync('src/integrations/supabase/types.ts', 'utf8');
const completedBillRuntime = readFileSync(
  'supabase/tests/completed_bill_corrections.sql',
  'utf8',
);

function functionBody(name: string): string {
  const definitions = Array.from(sql.matchAll(
    new RegExp(
      `create(?: or replace)? function public\\.${name}\\s*\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`,
      'gi',
    ),
  ));
  return definitions.at(-1)?.[1] ?? '';
}

describe('panel claim portion migration', () => {
  it('creates child, receipt, and immutable audit storage', () => {
    expect(sql).toMatch(/create table public\.panel_claim_portions/i);
    expect(sql).toMatch(/create table public\.panel_claim_portion_receipts/i);
    expect(sql).toMatch(/create table public\.panel_claim_portion_audit/i);
  });

  it('checks roles server-side and exposes only RPC mutations', () => {
    expect(sql).toMatch(/admin.*doctor_admin.*ops_staff.*operations.*purchaser/is);
    expect(sql).toMatch(/revoke all on table public\.panel_claim_portions from authenticated/i);
    expect(sql).toMatch(/grant select on table public\.panel_claim_portions to authenticated/i);
  });

  it('locks the parent and rejects split changes after any receipt', () => {
    expect(sql).toMatch(/from public\.panel_claims.*for update/is);
    expect(sql).toMatch(/received_amount > 0/is);
  });

  it('requires exact totals and idempotent receipts', () => {
    expect(sql).toMatch(/sum\(.*amount.*\).*<>.*v_claim_amount/is);
    expect(sql).toMatch(/idempotency_key uuid.*unique/is);
  });

  it('exposes the exact secured RPC surface', () => {
    expect(sql).toMatch(
      /drop function public\.set_checkout_panel_claim_portions\(uuid, numeric, jsonb, text\)/i,
    );
    expect(sql).toMatch(
      /create function public\.replace_panel_claim_portions\s*\(\s*p_panel_claim_id uuid,\s*p_portions jsonb,\s*p_reason text,\s*p_expected_version bigint\s*\)/is,
    );
    expect(sql).toMatch(
      /create function public\.cancel_panel_claim_portions\s*\(\s*p_panel_claim_id uuid,\s*p_reason text,\s*p_expected_version bigint\s*\)/is,
    );
    expect(sql).toMatch(
      /create function public\.record_panel_claim_portion_payment\s*\(\s*p_portion_id uuid,\s*p_amount numeric,\s*p_received_date date,\s*p_payment_reference text,\s*p_remark text,\s*p_idempotency_key uuid\s*\)/is,
    );
    expect(sql).toMatch(/create function public\.update_panel_claim_workflow/i);
    expect(sql).toMatch(/create function public\.bulk_submit_panel_claims/i);
  });

  it('persists a validated panel split inside the authoritative checkout transaction', () => {
    const checkoutRpc = functionBody('checkout_visit');

    expect(checkoutRpc).toMatch(/v_authoritative_balance/i);
    expect(checkoutRpc).toMatch(/CHECKOUT_TOTAL_MISMATCH/i);
    expect(checkoutRpc).toMatch(/p_panel_covered_amount[\s\S]*v_authoritative_balance/i);
    expect(checkoutRpc).toMatch(/ensure_panel_claim_for_queue\(p_queue_entry_id\)/i);
    expect(checkoutRpc).toMatch(
      /update public\.panel_claims as claim[\s\S]*set amount = v_panel_covered_amount/is,
    );
    expect(checkoutRpc).toMatch(/replace_panel_claim_portions\([\s\S]*p_panel_portions/is);
    expect(checkoutRpc).toMatch(/panel_claim_checkout_requests/i);
    expect(checkoutRpc).toMatch(/v_claim\.status <> 'pending'/i);
    expect(checkoutRpc).toMatch(/PANEL_CLAIM_ALREADY_MATERIALIZED/i);
    expect(sql).toMatch(/'admin'.*'doctor_admin'.*'ops_staff'.*'operations'.*'purchaser'/is);
  });

  it('uses dispensed quantity for the authoritative checkout balance', () => {
    const checkoutRpc = functionBody('checkout_visit');

    expect(checkoutRpc).toMatch(
      /item\.price\s*\*\s*case\s+when item\.item_id is not null\s+then coalesce\(item\.dispensed_qty,\s*item\.quantity\)\s+else item\.quantity\s+end/i,
    );
  });

  it('removes the post-checkout caller-authoritative amount mutation path', () => {
    const checkoutRpc = functionBody('checkout_visit');
    const replaceRpc = functionBody('replace_panel_claim_portions');

    expect(sql).toMatch(/POSTFLIGHT_LEGACY_SPLIT_RPC_PRESENT/i);
    expect(checkoutRpc).toMatch(
      /v_panel_covered_amount := (?:pg_catalog\.)?round\(p_panel_covered_amount, 2\)/i,
    );
    expect(checkoutRpc).toMatch(/v_panel_covered_amount > v_authoritative_balance/i);
    expect(replaceRpc).toMatch(/sum\(candidate\.amount\)[\s\S]*<> v_claim_amount/i);
    expect(replaceRpc).not.toMatch(/set\s+amount\s*=/i);
  });

  it('rejects stale split replacement and cancellation versions', () => {
    const replaceRpc = functionBody('replace_panel_claim_portions');
    const cancelRpc = functionBody('cancel_panel_claim_portions');

    expect(sql).toMatch(/add column portions_version bigint not null default 0/i);
    expect(replaceRpc).toMatch(/p_expected_version is distinct from v_claim\.portions_version/i);
    expect(replaceRpc).toMatch(/STALE_PANEL_CLAIM_PORTIONS/i);
    expect(cancelRpc).toMatch(/p_expected_version is distinct from v_claim\.portions_version/i);
    expect(sql).toMatch(/portions_version = claim\.portions_version \+ 1/i);
  });

  it('updates generated client types for atomic checkout and versioned edits', () => {
    expect(sql).toMatch(
      /create or replace function public\.checkout_visit\([\s\S]*p_panel_covered_amount numeric[\s\S]*p_panel_portions jsonb[\s\S]*p_checkout_idempotency_key uuid/is,
    );
    expect(generatedTypes).toMatch(
      /checkout_visit:[\s\S]*p_checkout_idempotency_key\?: string[\s\S]*p_panel_covered_amount\?: number[\s\S]*p_panel_portions\?: Json/is,
    );
    expect(generatedTypes).toMatch(/replace_panel_claim_portions:[\s\S]*p_expected_version: number/is);
    expect(generatedTypes).toMatch(
      /bulk_submit_panel_claims:[\s\S]*p_panel_claim_ids: string\[\][\s\S]*p_submitted_date: string \| null[\s\S]*returns: number/is,
    );
    expect(generatedTypes).toMatch(/portions_version: number/i);
  });

  it('pins every security definer search path and restricts helper execution', () => {
    const securityDefiners = sql.match(/security definer/gi) ?? [];
    const pinnedPaths = sql.match(/set search_path = pg_catalog/gi) ?? [];
    expect(securityDefiners.length).toBeGreaterThanOrEqual(5);
    expect(pinnedPaths.length).toBeGreaterThanOrEqual(securityDefiners.length);
    expect(sql).toMatch(
      /revoke all on function public\.can_manage_panel_claim_portions\(uuid\) from public/is,
    );
    expect(sql).toMatch(
      /revoke all on function public\.can_manage_panel_claim_portions\(uuid\) from authenticated/is,
    );
    expect(sql).toMatch(
      /grant execute on function public\.can_manage_panel_claim_portions\(uuid\) to service_role/is,
    );
  });

  it('makes receipt and audit storage append-only', () => {
    expect(sql).toMatch(/before update or delete or truncate on public\.panel_claim_portion_receipts/is);
    expect(sql).toMatch(/before update or delete or truncate on public\.panel_claim_portion_audit/is);
    expect(sql).toMatch(/revoke all on table public\.panel_claim_portion_receipts from authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.panel_claim_portion_audit from authenticated/i);
  });

  it('denies service role direct mutations while retaining only required portion reads', () => {
    const tables = [
      'panel_claim_portions',
      'panel_claim_portion_receipts',
      'panel_claim_portion_audit',
    ];
    const mutations = ['insert', 'update', 'delete', 'truncate'];

    for (const table of tables) {
      expect(sql).toMatch(
        new RegExp(`revoke all on table public\\.${table} from service_role`, 'i'),
      );
      for (const mutation of mutations) {
        expect(sql).toMatch(
          new RegExp(
            `has_table_privilege\\(\\s*'service_role',\\s*'public\\.${table}',\\s*'${mutation}'\\s*\\)`,
            'i',
          ),
        );
      }
    }

    expect(sql).toMatch(/grant select on table public\.panel_claim_portions to service_role/i);
    expect(sql).toMatch(/alter table public\.panel_claim_portions owner to postgres/i);
    expect(sql).toMatch(/postflight_service_role_direct_write_privilege/i);
  });

  it('binds every receipt portion to the same parent claim', () => {
    expect(sql).toMatch(
      /constraint panel_claim_portions_id_claim_unique\s+unique \(id, panel_claim_id\)/is,
    );
    expect(sql).toMatch(
      /constraint panel_claim_portion_receipts_portion_claim_fkey\s+foreign key \(panel_claim_portion_id, panel_claim_id\)\s+references public\.panel_claim_portions\(id, panel_claim_id\) on delete restrict/is,
    );
    expect(sql).toMatch(/postflight_receipt_parent_membership/i);
  });

  it('serializes payments and returns an existing idempotent result', () => {
    expect(sql).toMatch(/from public\.panel_claim_portions.*for update/is);
    expect(sql).toMatch(/on conflict \(idempotency_key\) do nothing/is);
    expect(sql).toMatch(/if v_existing_portion_id is not null.*return v_portion/is);
  });

  it('keeps general replacements from changing billed amount and verifies security postflight', () => {
    expect(functionBody('replace_panel_claim_portions')).not.toMatch(/set\s+amount\s*=/i);
    expect(sql).toMatch(/postflight_missing_table/i);
    expect(sql).toMatch(/postflight_insecure_function/i);
    expect(sql).toMatch(/postflight_direct_write_privilege/i);
  });

  it('enforces parent-child totals and split-aware completed-bill corrections at commit', () => {
    expect(sql).toMatch(/create constraint trigger panel_claim_portions_integrity/i);
    expect(sql).toMatch(/deferrable initially deferred/i);
    expect(sql).toMatch(/PORTION_PARENT_AMOUNT_MISMATCH/i);
    expect(sql).toMatch(/PORTION_PARENT_RECEIVED_MISMATCH/i);
    expect(sql).toMatch(/create function private\.rebalance_panel_claim_portions/i);
    expect(sql).toMatch(/completed_bill_correction_guard[\s\S]*stage_panel_claim_split_correction/is);
    expect(sql).toMatch(/create table private\.panel_claim_split_correction_context/i);
    expect(sql).toMatch(
      /revoke all on table private\.panel_claim_split_correction_context[\s\S]*authenticated/is,
    );
    expect(sql).not.toMatch(/current_setting\(\s*'app\.panel_claim_split_correction'/i);
    expect(sql).toMatch(/PANEL_SPLIT_CORRECTION_BELOW_RECEIPTS/i);
  });

  it('allows purchaser claim reads without broadening the finance-admin policy', () => {
    const workflowRpc = functionBody('update_panel_claim_workflow');

    expect(sql).toMatch(/create policy panel_claims_purchaser_read[\s\S]*role::text = 'purchaser'/is);
    expect(sql).not.toMatch(/create or replace function public\.is_finance_admin/i);
    expect(sql).toMatch(
      /create policy panel_claims_finance_admin_update[\s\S]*using \(public\.is_finance_admin\(\)\)[\s\S]*with check \(public\.is_finance_admin\(\)\)/is,
    );
    expect(workflowRpc).toMatch(/if not public\.is_finance_admin\(\)/i);
  });

  it('preserves claim workflow fields while child receipts remain authoritative', () => {
    const workflowRpc = functionBody('update_panel_claim_workflow');

    expect(workflowRpc).toMatch(/submitted_date/i);
    expect(workflowRpc).toMatch(/approved_amount/i);
    expect(workflowRpc).toMatch(/gl_document_url/i);
    expect(workflowRpc).toMatch(/remarks/i);
    expect(workflowRpc).toMatch(/SPLIT_RECEIPTS_CONTROL_STATUS/i);
  });

  it('bulk submission is finance-admin-only and filters terminal claims', () => {
    const bulkRpc = functionBody('bulk_submit_panel_claims');

    expect(bulkRpc).toMatch(/if not public\.is_finance_admin\(\)/i);
    expect(bulkRpc).toMatch(/status in \('pending', 'submitted', 'approved'\)/i);
    expect(bulkRpc).toMatch(/get diagnostics v_updated_count = row_count/i);
    expect(sql).toMatch(
      /revoke all on function public\.bulk_submit_panel_claims\(uuid\[\], date\) from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.bulk_submit_panel_claims\(uuid\[\], date\)\s+to authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /hardening_postflight[\s\S]*to_regprocedure\('public\.bulk_submit_panel_claims\(uuid\[\],date\)'\)[\s\S]*POSTFLIGHT_HARDENED_FUNCTION_INSECURE/i,
    );
    expect(sql).toMatch(
      /hardening_postflight[\s\S]*has_function_privilege\(\s*'authenticated',[\s\S]*bulk_submit_panel_claims[\s\S]*has_function_privilege\(\s*'service_role',[\s\S]*bulk_submit_panel_claims[\s\S]*POSTFLIGHT_BULK_SUBMIT_PRIVILEGE/i,
    );
  });

  it('reopens an underpaid received unsplit claim only for an audited correction', () => {
    const parentGuard = sql.match(
      /create function private\.guard_panel_claim_split_parent_mutation\(\)[\s\S]*?as \$function\$([\s\S]*?)\$function\$;/i,
    )?.[1] ?? '';

    expect(parentGuard).toMatch(
      /if not v_has_split[\s\S]*old\.status = 'received'[\s\S]*new\.received_amount[\s\S]*new\.amount[\s\S]*new\.status := 'approved'/i,
    );
    expect(parentGuard).toMatch(
      /if not v_has_split[\s\S]*delete from private\.panel_claim_split_correction_context[\s\S]*return new/i,
    );
    expect(completedBillRuntime).toMatch(
      /correct_completed_bill\([\s\S]*TEST panel reconciliation[\s\S]*panel_credit_due[\s\S]*correct_completed_bill\([\s\S]*TEST panel outstanding correction[\s\S]*update_panel_claim_workflow\([\s\S]*PANEL_CLAIM_REMAINING_PAYMENT_STRANDED/i,
    );
  });

  it('blocks split creation and receipts for terminal claims', () => {
    const replaceRpc = functionBody('replace_panel_claim_portions');
    const paymentRpc = functionBody('record_panel_claim_portion_payment');

    expect(replaceRpc).toMatch(/v_claim\.status not in \('pending', 'submitted', 'approved'\)/i);
    expect(paymentRpc).toMatch(/v_claim\.status not in \('pending', 'submitted', 'approved'\)/i);
    expect(sql).toMatch(/TERMINAL_PANEL_CLAIM_IMMUTABLE/i);
  });
});
