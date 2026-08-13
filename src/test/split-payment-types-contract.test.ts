import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
describe('generated split payment schema contract', () => {
  it('places batch types only on payments and declares new tables', () => {
    expect(types).toContain('payment_batches: {');
    expect(types).toContain('payment_void_audit: {');
    const payments = types.match(/payments: \{[\s\S]*?performance_appraisals:/)?.[0] ?? '';
    expect(payments).toContain('batch_id: string | null');
    expect(payments).toContain('payments_batch_id_fkey');
    const claims = types.match(/panel_claims: \{[\s\S]*?payment_batches:/)?.[0] ?? '';
    expect(claims).not.toContain('payments_batch_id_fkey');
  });
});
