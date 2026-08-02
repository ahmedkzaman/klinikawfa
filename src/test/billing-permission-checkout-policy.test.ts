import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_honor_billing_permission_for_checkout.sql'),
);
const migration = migrationName
  ? readFileSync(resolve(migrationsDirectory, migrationName), 'utf8')
  : '';

describe('checkout billing permission policy', () => {
  it('combines legacy checkout roles with the effective billing permission', () => {
    expect(migration).toMatch(
      /create or replace function public\.can_checkout_visit\([\s\S]*public\.is_staff_or_admin\(_user_id\)[\s\S]*public\.has_clinic_permission\('billing\.manage', _user_id\)/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.can_checkout_visit\(uuid\) from public/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.can_checkout_visit\(uuid\) from authenticated/i,
    );
  });

  it('uses the billing-specific guard in both active checkout RPCs', () => {
    const checkout = migration.match(
      /create or replace function public\.checkout_visit[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const compactCheckout = migration.match(
      /create or replace function public\.record_payment_and_complete_visit[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(checkout).toContain('public.can_checkout_visit(auth.uid())');
    expect(compactCheckout).toContain('public.can_checkout_visit(auth.uid())');
    expect(checkout).not.toContain('IF NOT public.is_staff_or_admin(auth.uid())');
    expect(compactCheckout).not.toContain('IF NOT public.is_staff_or_admin(auth.uid())');
  });
});
