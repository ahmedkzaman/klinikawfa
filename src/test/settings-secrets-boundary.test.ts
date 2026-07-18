import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

function readRepoFile(path: string): string {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

const migration = readRepoFile(
  'supabase/migrations/20260718130000_harden_settings_secrets_boundary.sql',
);
const settingsPage = readRepoFile('src/pages/admin/Settings.tsx');
const clinicSettingsHook = readRepoFile('src/hooks/clinic/useClinicSettings.ts');
const videoPayment = readRepoFile('supabase/functions/video-payment/index.ts');

describe('settings and secrets boundary', () => {
  test('makes full clinic settings finance-admin-only', () => {
    expect(migration).toContain(
      'CREATE POLICY "clinic_settings_finance_admin_read"',
    );
    expect(migration).toContain('USING (public.is_finance_admin());');
  });

  test('provides an authenticated safe clinic-settings RPC', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_clinic_settings()',
    );
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_clinic_settings() FROM PUBLIC;',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_clinic_settings() FROM anon;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_clinic_settings() TO authenticated;',
    );
  });

  test('redacts bank and tax fields for non-finance clinic roles', () => {
    for (const field of [
      'bank_name',
      'bank_account_no',
      'bank_account_holder',
      'sst_number',
    ]) {
      expect(migration).toContain(`'${field}', NULL`);
    }
  });

  test('removes obsolete Stripe-key rows and prevents their return', () => {
    expect(migration).toContain('DELETE FROM public.app_settings');
    expect(migration).toContain(
      "WHERE key IN ('stripe_secret_key', 'stripe_restricted_key');",
    );
    expect(migration).toContain('app_settings_forbid_browser_secrets');
    expect(migration).toContain(
      "CHECK (key NOT IN ('stripe_secret_key', 'stripe_restricted_key'))",
    );
  });

  test('routes clinic-settings reads through the safe RPC', () => {
    expect(clinicSettingsHook).toContain("supabase.rpc('get_clinic_settings')");
    expect(clinicSettingsHook).not.toMatch(
      /from\('clinic_settings' as never\)[\s\S]{0,100}select\('\*'\)/,
    );
  });

  test('never loads or stores Stripe credentials in the browser', () => {
    expect(settingsPage).not.toMatch(/stripe_(?:secret|restricted)_key/);
    expect(settingsPage).not.toContain('StripeKeyState');
    expect(settingsPage).not.toContain('KeyInput');
    expect(settingsPage).not.toContain('saveKey');
    expect(settingsPage).not.toContain('clearKey');
  });

  test('uses only the Edge Function environment secret for Stripe', () => {
    expect(videoPayment).toContain('Deno.env.get("STRIPE_SECRET_KEY")');
    expect(videoPayment).not.toContain('.from("app_settings")');
    expect(videoPayment).not.toContain('stripe_secret_key');
  });
});
