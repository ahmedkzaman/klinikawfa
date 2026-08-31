import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
describe('generated split payment schema contract', () => {
  it('places batch types only on payments and declares new tables', () => {
    expect(types).toContain('payment_batches: {');
    expect(types).toContain('payment_void_audit: {');
    const batches = types.match(/payment_batches: \{[\s\S]*?payment_void_audit:/)?.[0] ?? '';
    expect(batches).not.toContain('consultation_id');
    const payments = types.match(/\n\s{6}payments: \{[\s\S]*?\n\s{6}performance_appraisals:/)?.[0] ?? '';
    expect(payments).toContain('batch_id: string | null');
    expect(payments).toContain('payments_batch_id_fkey');
    const claims = types.match(/panel_claims: \{[\s\S]*?payment_batches:/)?.[0] ?? '';
    expect(claims).not.toContain('payments_batch_id_fkey');
  });

  it('models batch defaults, coordinator foreign keys, and debt overloads exactly', () => {
    const batches = types.match(/payment_batches: \{[\s\S]*?payment_void_audit:/)?.[0] ?? '';
    expect(batches).toContain('queue_entry_id: string | null');
    expect(batches).toContain('coordination_queue_entry_id: string | null');
    expect(batches).toContain('selected_queue_entry_ids: string[]');
    expect(batches).toMatch(/Insert:[\s\S]*actor_id\?: string/);
    expect(batches).toContain('payment_batches_actor_id_fkey');
    expect(batches).toContain('payment_batches_queue_entry_id_fkey');
    expect(batches).toContain('payment_batches_coordination_queue_entry_id_fkey');

    const voidAudit = types.match(/payment_void_audit: \{[\s\S]*?payments: \{/)?.[0] ?? '';
    expect(voidAudit).toContain('payment_void_audit_actor_id_fkey');
    expect(voidAudit).toContain('payment_void_audit_payment_id_fkey');
    expect(voidAudit).toContain('payment_void_audit_queue_entry_id_fkey');

    const debt = types.match(/settle_multiple_debts:[\s\S]*?settle_multiple_debts_legacy_core:/)?.[0] ?? '';
    // Overloaded RPC renders as a union; both overloads require their args.
    expect(debt).toMatch(/settle_multiple_debts:[\s\S]*\| \{[\s\S]*Args:/);
    expect(debt).toMatch(/p_idempotency_key: string/);
    expect(debt).not.toMatch(/p_idempotency_key\?: string/);
  });

  it('models authenticated payment provenance as server-defaulted insert fields', () => {
    const payments = types.match(/\n\s{6}payments: \{[\s\S]*?\n\s{6}performance_appraisals:/)?.[0] ?? '';
    const insert = payments.match(/Insert:\s*\{[\s\S]*?\}\s*Update:/)?.[0] ?? '';
    // Production catalog: created_by is nullable with default auth.uid(); created_at defaults to now().
    expect(insert).toMatch(/created_by\?: string \| null/);
    expect(insert).toMatch(/created_at\?: string\b/);
  });
});
