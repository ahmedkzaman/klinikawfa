import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260717092103_harden_finance_boundaries.sql',
  ),
  'utf8',
);
const providerHook = readFileSync(
  resolve(process.cwd(), 'src/hooks/clinic/useInsuranceProviders.ts'),
  'utf8',
);
const queueHook = readFileSync(
  resolve(process.cwd(), 'src/hooks/clinic/useQueueEntries.ts'),
  'utf8',
);
const checkout = readFileSync(
  resolve(process.cwd(), 'src/pages/clinic/DispenseCheckout.tsx'),
  'utf8',
);

describe('finance boundary hardening', () => {
  test('limits full insurance-provider rows to finance admins', () => {
    expect(migration).toContain('"insurance_providers_finance_admin_read"');
    expect(migration).toContain('USING (public.is_finance_admin());');
    expect(migration).not.toContain(
      'USING (public.is_staff_or_clinical(auth.uid()));',
    );
  });

  test('exposes only the safe provider directory to clinic roles', () => {
    expect(migration).toContain(
      'RETURNS TABLE(id uuid, name text, status text)',
    );
    expect(migration).toContain(
      'public.is_staff_or_clinical(auth.uid())',
    );
    expect(migration).toContain('OR public.is_finance_admin()');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_insurance_provider_directory(boolean) FROM PUBLIC;',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_insurance_provider_directory(boolean) FROM anon;',
    );
  });

  test('keeps invoice item saving while enforcing finance authorization', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.save_client_invoice_items(',
    );
    expect(migration).toContain(
      'IF auth.uid() IS NULL OR NOT public.is_finance_admin() THEN',
    );
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.save_client_invoice_items(uuid, jsonb) FROM PUBLIC;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_client_invoice_items(uuid, jsonb) TO authenticated;',
    );
  });

  test('routes clinical directory reads through the safe RPC', () => {
    expect(providerHook).toContain("'get_insurance_provider_directory'");
    expect(providerHook).toContain('useFinanceInsuranceProviders');
    expect(queueHook).toContain('fetchInsuranceProviderDirectory');
    expect(queueHook).not.toContain('insurance_providers ( id, name )');
  });

  test('fails panel checkout closed when finance terms are unavailable', () => {
    expect(checkout).toContain("panelInfoStatus !== 'ready'");
    expect(checkout).toContain('Panel billing details are unavailable.');
  });
});
