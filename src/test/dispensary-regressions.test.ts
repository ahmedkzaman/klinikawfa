import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const checkoutPage = readFileSync(
  resolve(process.cwd(), 'src/pages/clinic/DispenseCheckout.tsx'),
  'utf8',
);

describe('dispensary regressions', () => {
  test('matches the live checkout_visit RPC signature', () => {
    expect(checkoutPage).toContain("supabase.rpc('checkout_visit', rpcArgs)");
    expect(checkoutPage).toContain('p_panel_covered_amount');
    expect(checkoutPage).toContain('p_panel_portions');
    expect(checkoutPage).toContain('p_checkout_idempotency_key');
  });

  test('persists checkout and portions in one authoritative transaction', () => {
    expect(checkoutPage).not.toContain('useSetCheckoutPanelClaimPortions');
    expect(checkoutPage).not.toContain('useReplacePanelClaimPortions');
    expect(checkoutPage).not.toContain('pendingPanelSplit');
    expect(checkoutPage).not.toContain('Retry saving split');
    expect(checkoutPage).not.toContain("from('panel_claims')");
    expect(checkoutPage).not.toContain('.update({ amount: panelCoveredAmount })');
  });

  test('prints labels through the shared PDF generator path', () => {
    expect(checkoutPage).toContain('generateDrugLabelPdf');
    expect(checkoutPage).not.toContain('DrugLabelPrintout');
  });

  test('initializes the patient before the label print callback reads it', () => {
    const patientDeclaration = checkoutPage.indexOf('const patient = entry?.patients');
    const printCallback = checkoutPage.indexOf('const handlePrintLabels = useCallback');

    expect(patientDeclaration).toBeGreaterThan(-1);
    expect(printCallback).toBeGreaterThan(-1);
    expect(patientDeclaration).toBeLessThan(printCallback);
  });
});
