import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('dispensary staff price permissions migration', () => {
  it('keeps consultation item staff helpers aligned with operational roles', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725143000_include_new_staff_roles_in_dispensary_helpers.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_staff_or_admin');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_ops_or_admin');
    expect(migration).toContain("'purchaser'");
    expect(migration).toContain("'staff_nurse'");
    expect(migration).toContain("'resident_doctor'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_staff_or_admin(uuid) FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.is_ops_or_admin(uuid) TO authenticated');
  });

  it('does not grant locums the dispensary price-edit permission', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260725044416_deny_locum_dispensary_price_edits.sql',
      ),
      'utf8',
    );

    const priceHelper = migration.match(
      /CREATE OR REPLACE FUNCTION public\.can_edit_dispensary_prices[\s\S]*?GRANT EXECUTE ON FUNCTION public\.can_edit_dispensary_prices\(uuid\) TO authenticated;/,
    )?.[0] ?? '';

    expect(priceHelper).not.toContain("'locum'");
    expect(priceHelper).toContain("'resident_doctor'");
    expect(migration).toContain('can_edit_dispensary_prices');
    expect(migration).toContain('consultation_items_staff_update_active');
    expect(migration).toContain('public.can_edit_dispensary_prices(auth.uid())');
  });
});
