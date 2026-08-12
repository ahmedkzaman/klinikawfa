import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('record payment checkout contract', () => {
  const dialog = readSource(
    'src/components/clinic/visit/RecordPaymentDialog.tsx',
  );
  const billing = readSource(
    'src/components/clinic/visit/BillingDetailsColumn.tsx',
  );
  const checkout = readSource('src/pages/clinic/DispenseCheckout.tsx');
  const completedVisit = readSource('src/pages/clinic/VisitDetail.tsx');
  const paymentHooks = readSource('src/hooks/clinic/usePayments.ts');

  it('routes only the active visit path through the atomic split checkout mutation', () => {
    expect(dialog).toContain('useRecordSplitPaymentsAndCompleteVisit');
    expect(dialog).toContain('useRecordSplitPayments');
    expect(dialog).toMatch(
      /completeVisitOnPayment[\s\S]*\?[\s\S]*recordSplitPaymentsAndCompleteVisit[\s\S]*:[\s\S]*recordSplitPayments/,
    );
    expect(dialog).not.toContain('useUpdateConsultation');
    expect(dialog).not.toContain('useUpdateQueueEntry');
    expect(dialog).not.toContain("status: 'completed'");
    expect(dialog).not.toContain("clinic_status: 'completed'");
    expect(paymentHooks).toMatch(
      /supabase\.rpc\(\s*['"]record_split_payments_and_complete_visit['"]/,
    );
  });

  it('marks dispensary as completion mode and leaves completed visits insert-only', () => {
    expect(billing).toContain('completeVisitOnPayment?: boolean');
    expect(billing).toContain('completeVisitOnPayment={completeVisitOnPayment}');
    expect(checkout).toMatch(
      /<BillingDetailsColumn[\s\S]*completeVisitOnPayment/,
    );
    expect(completedVisit).not.toContain('completeVisitOnPayment');
  });
});
