import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dispensary removal compatibility for already-open clients', () => {
  it('allows staff to read only rows they personally soft-deleted', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725183000_allow_own_removed_item_returning.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('FOR SELECT TO authenticated');
    expect(migration).toContain('deleted_at IS NOT NULL');
    expect(migration).toContain('deleted_by = auth.uid()');
    expect(migration).not.toContain('OR deleted_at IS NOT NULL');
  });
});
