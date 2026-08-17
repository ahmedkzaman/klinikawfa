import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorClinicalActivity } from '@/components/clinic/insight/DoctorClinicalActivity';
import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { FinancialDetailSheet } from '@/components/clinic/insight/management/FinancialDetailSheet';
import type { DoctorActivitySummary } from '@/lib/clinic/doctorClinicalActivity';
import type { FinancialControlDetailRow } from '@/lib/clinic/financialControl';

const { useDoctorClinicalActivityMock, useFinancialControlDetailsMock } = vi.hoisted(() => ({
  useDoctorClinicalActivityMock: vi.fn(),
  useFinancialControlDetailsMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useDoctorClinicalActivity', () => ({
  useDoctorClinicalActivity: useDoctorClinicalActivityMock,
}));
vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlDetails: useFinancialControlDetailsMock,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

const startDate = new Date(2026, 7, 1, 12);
const endDate = new Date(2026, 7, 7, 12);

const doctorSummaries: DoctorActivitySummary[] = [{
  doctorId: 'doctor-a',
  doctorName: 'Dr A',
  procedures: 1,
  mc: 0,
  quarantine: 0,
  referral: 0,
  totalDocuments: 0,
  rows: [{
    activityId: 'procedure-a',
    activityKind: 'procedure',
    activityDate: '2026-08-05',
    activityName: 'Dressing',
    consultationId: 'consultation-a',
    queueEntryId: 'queue-a',
    queueCreatedAt: '2026-08-05T09:00:00.000Z',
    queueSequence: 1,
    doctorId: 'doctor-a',
    doctorName: 'Dr A',
    patientName: 'Patient A',
    unitPrice: 45,
    quantity: 1,
    totalPrice: 45,
  }],
}];

const detailRow = {
  queueEntryId: 'queue-1',
  consultationId: 'consultation-1',
  completedDate: '2026-08-06',
  patientName: 'Aisyah Rahman',
  doctorName: 'Dr Lim',
  paymentType: 'panel',
  paymentMethod: 'bank_transfer',
  panelProviderName: 'Acme Health',
  claimStatus: 'submitted',
  claimCreatedDate: '2026-08-06',
  claimDueDate: '2026-09-05',
  groupKey: 'group-1',
  groupLabel: 'Visit 1',
  billed: 250,
  paid: 100,
  paidInPeriod: 100,
  outstanding: 150,
  cogs: 80,
  profit: 170,
  marginPct: 68,
  discount: 10,
  tax: 0,
  refund: 0,
  corrections: 0,
  missingCostCount: 0,
  zeroPriceCount: 0,
  amount: 250,
  alertKeys: [],
  attributionComplete: true,
  costComplete: true,
  visitCount: 1,
} satisfies FinancialControlDetailRow;

function renderInShell(children: React.ReactNode, section: 'finance' | 'performance') {
  return render(
    <InsightShell
      section={section}
      onSectionChange={vi.fn()}
      range={{ from: startDate, to: endDate }}
      onRangeChange={vi.fn()}
      comparisonEnabled={false}
      onComparisonChange={vi.fn()}
      onRefresh={vi.fn()}
      exportItems={[]}
      confidence="current period"
    >
      {children}
    </InsightShell>,
  );
}

async function chooseExport(label: string) {
  if (!screen.queryByRole('menu', { name: 'Export' })) {
    const trigger = screen.getByRole('button', { name: 'Export' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
  }
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
}

describe('InsightShell registered exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDoctorClinicalActivityMock.mockReturnValue({
      data: doctorSummaries,
      isLoading: false,
      isError: false,
      error: null,
    });
    useFinancialControlDetailsMock.mockReturnValue({
      data: {
        rows: [detailRow],
        total: 1,
        page: 1,
        pageSize: 25,
        totals: {
          billed: 250,
          paid: 100,
          outstanding: 150,
          cogs: 80,
          profit: 170,
          attributionComplete: true,
          costComplete: true,
          incompleteRows: 0,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:insight-export') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('invokes all-doctor and per-doctor CSV actions from the shell without nested export buttons', async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    renderInShell(<DoctorClinicalActivity startDate={startDate} endDate={endDate} />, 'performance');

    expect(screen.queryByRole('button', { name: 'Export all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export Dr A' })).not.toBeInTheDocument();

    await chooseExport('Doctor clinical activity CSV');
    await chooseExport('Doctor activity: Dr A');

    expect(downloads).toEqual([
      'doctor-clinical-activity-2026-08-01-to-2026-08-07.csv',
      'doctor-clinical-activity-dr-a-2026-08-01-to-2026-08-07.csv',
    ]);
  });

  it('invokes the financial detail CSV action from the shell without a nested export button', async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    renderInShell(
      <FinancialDetailSheet
        open
        onOpenChange={vi.fn()}
        title="Billed Revenue details"
        startDate={startDate}
        endDate={endDate}
        metric="billed_revenue"
        groupBy="visit"
        alertKey={null}
        page={1}
        pageSize={25}
        onGroupByChange={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
      'finance',
    );

    expect(screen.queryByRole('button', { name: 'Export financial details as CSV' })).not.toBeInTheDocument();
    await chooseExport('Financial details CSV');

    await waitFor(() => expect(downloads).toEqual([
      'financial_control_2026-08-01_to_2026-08-07_billed_revenue_visit.csv',
    ]));
  });
});
