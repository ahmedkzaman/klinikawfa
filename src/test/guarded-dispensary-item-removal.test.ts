import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('guarded dispensary item removal', () => {
  it('uses a guarded RPC instead of a direct consultation_items update', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/hooks/clinic/useConsultationItems.ts'),
      'utf8',
    );
    const removeHook = source.slice(
      source.indexOf('export function useRemoveConsultationItem'),
      source.indexOf('export function useUpdateDispensedQty'),
    );

    expect(removeHook).toMatch(
      /\.rpc\(\s*'remove_consultation_item_dispensary'/,
    );
    expect(removeHook).not.toContain(".from('consultation_items')");
  });

  it('checks authorization and soft-deletes one active consultation item', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725180000_guard_dispensary_item_removal.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('public.can_edit_dispensary_prices(auth.uid())');
    expect(migration).toContain('deleted_at = now()');
    expect(migration).toContain('deleted_by = auth.uid()');
    expect(migration).toContain('AND consultation_id = p_consultation_id');
    expect(migration).toContain('AND deleted_at IS NULL');
    expect(migration).toContain('REVOKE ALL ON FUNCTION');
    expect(migration).toContain('GRANT EXECUTE');
  });
});
