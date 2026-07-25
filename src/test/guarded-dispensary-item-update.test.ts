import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('guarded dispensary item updates', () => {
  it('uses the guarded RPC instead of a direct consultation_items update', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/hooks/clinic/useConsultationItems.ts'),
      'utf8',
    );
    const updateHook = source.slice(source.indexOf('export function useUpdateConsultationItem'));

    expect(updateHook).toMatch(
      /\.rpc\(\s*'update_consultation_item_dispensary'/,
    );
    expect(updateHook).not.toContain(".from('consultation_items')");
  });

  it('checks the caller and limits the writable row and fields', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725090055_add_guarded_dispensary_item_update.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('public.can_edit_dispensary_prices(auth.uid())');
    expect(migration).toContain('AND consultation_id = p_consultation_id');
    expect(migration).toContain('AND deleted_at IS NULL');
    expect(migration).toContain("p_updates - ARRAY[");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.update_consultation_item_dispensary',
    );
    expect(migration).toContain('GRANT EXECUTE');
  });
});
