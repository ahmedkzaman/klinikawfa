import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';
import { insightQueryFlags, insightQueryKeyPrefixes } from '@/hooks/clinic/useInsightSectionData';
import type { InsightSection } from '@/lib/clinic/insight/insightSections';

const hookMocks = vi.hoisted(() => ({
  clinicHealth: vi.fn(),
  bankHealth: vi.fn(),
  financialControlSummary: vi.fn(),
  attendanceHeatmap: vi.fn(),
  financialInsights: vi.fn(),
  salesInsights: vi.fn(),
  panelBilledInsights: vi.fn(),
  scoreboards: vi.fn(),
  doctorClinicalActivity: vi.fn(),
  patientLtv: vi.fn(),
  insightPerformance: vi.fn(),
}));

vi.mock('@/hooks/clinic/useClinicHealth', () => ({ useClinicHealth: hookMocks.clinicHealth }));
vi.mock('@/hooks/clinic/useBankHealth', () => ({ useBankHealth: hookMocks.bankHealth }));
vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: hookMocks.financialControlSummary,
  useFinancialControlDetails: vi.fn(),
}));
vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({ useAttendanceHeatmap: hookMocks.attendanceHeatmap }));
vi.mock('@/hooks/clinic/useFinancialInsights', () => ({ useFinancialInsights: hookMocks.financialInsights }));
vi.mock('@/hooks/clinic/useSalesInsights', () => ({ useSalesInsights: hookMocks.salesInsights }));
vi.mock('@/hooks/clinic/usePanelBilledInsights', () => ({ usePanelBilledInsights: hookMocks.panelBilledInsights }));
vi.mock('@/hooks/clinic/useScoreboards', () => ({ useScoreboards: hookMocks.scoreboards }));
vi.mock('@/hooks/clinic/useDoctorClinicalActivity', () => ({ useDoctorClinicalActivity: hookMocks.doctorClinicalActivity }));
vi.mock('@/hooks/clinic/usePatientLTV', () => ({ usePatientLTV: hookMocks.patientLtv }));
vi.mock('@/hooks/clinic/useInsightPerformance', () => ({ useInsightPerformance: hookMocks.insightPerformance }));
vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: () => ({ data: null, isLoading: false, isError: false, error: null }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isDoctorAdmin: false, user: null, isClinical: false }),
}));
vi.mock('@/components/patients/PatientProfileSheet', () => ({ PatientProfileSheet: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

const idleQuery = {
  data: undefined,
  isLoading: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

const allHookNames = Object.keys(hookMocks) as Array<keyof typeof hookMocks>;

const expectedHooks: Record<InsightSection, ReadonlySet<keyof typeof hookMocks>> = {
  command: new Set(['clinicHealth', 'financialControlSummary', 'attendanceHeatmap']),
  finance: new Set(['financialControlSummary', 'financialInsights', 'salesInsights', 'panelBilledInsights']),
  performance: new Set([
    'insightPerformance',
  ]),
  planning: new Set(['attendanceHeatmap']),
};

function renderSection(section: InsightSection) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.replaceState({}, '', `/clinic/insight?section=${section}`);
  return render(
    <QueryClientProvider client={client}>
      <Insight
        initialSearch={`?section=${section}`}
        access={{
          canOpenInsight: true,
          canSeeNamedDoctors: true,
          canSeeClinicDoctorBenchmarks: true,
          canSeeServicePerformance: true,
          ownDoctorId: null,
        }}
        viewerRole="doctor_admin"
        viewerScope={{ userId: 'query-test-user', reportsView: { allowed: true, version: 'v1' } }}
      />
    </QueryClientProvider>,
  );
}

describe('insightQueryFlags', () => {
  it.each(['command', 'finance', 'performance', 'planning'] as const)(
    'enables only the active %s section',
    (section) => {
      const flags = insightQueryFlags(section);

      expect(flags[section]).toBe(true);
      expect(Object.values(flags).filter(Boolean)).toHaveLength(1);
    },
  );

  it('refreshes all active finance ledgers together', () => {
    expect(insightQueryKeyPrefixes('finance')).toEqual([
      ['financial-control'],
      ['financial-insights'],
      ['sales-insights'],
      ['panel-billed-insights'],
    ]);
  });

  it('refreshes only the secured performance report and its on-demand detail query', () => {
    expect(insightQueryKeyPrefixes('performance')).toEqual([
      ['insight-performance'],
      ['insight-performance-detail'],
      ['doctor-clinical-activity'],
    ]);
  });

  it('refreshes the clinical attendance heatmap when planning is active', () => {
    expect(insightQueryKeyPrefixes('planning')).toEqual([
      ['clinical-attendance-heatmap'],
    ]);
  });
});

describe('Clinic Insight active-query boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const hook of Object.values(hookMocks)) hook.mockReturnValue(idleQuery);
  });

  it.each(['command', 'finance', 'performance', 'planning'] as const)(
    'executes only the expected %s section hooks with enabled true',
    (section) => {
      renderSection(section);

      for (const name of allHookNames) {
        if (expectedHooks[section].has(name)) {
          expect(hookMocks[name], `${name} should execute for ${section}`).toHaveBeenCalled();
        } else {
          expect(hookMocks[name], `${name} should stay inactive for ${section}`).not.toHaveBeenCalled();
        }
      }

      if (section === 'command') {
        expect(hookMocks.clinicHealth.mock.calls[0][2]).toEqual({ enabled: true });
        expect(hookMocks.financialControlSummary.mock.calls[0][1]).toEqual({ enabled: true });
        expect(hookMocks.attendanceHeatmap.mock.calls[0][0]).toMatchObject({ doctorId: null });
      } else if (section === 'finance') {
        expect(hookMocks.financialControlSummary.mock.calls[0][1]).toEqual({ enabled: true });
        expect(hookMocks.financialInsights.mock.calls[0][2]).toEqual({ enabled: true });
        expect(hookMocks.salesInsights.mock.calls[0][2]).toEqual({ enabled: true });
        expect(hookMocks.panelBilledInsights.mock.calls[0][2]).toEqual({ enabled: true });
      } else if (section === 'performance') {
        expect(hookMocks.insightPerformance.mock.calls[0][3]).toEqual({ enabled: true });
      } else {
        expect(hookMocks.attendanceHeatmap.mock.calls[0][0]).toMatchObject({ doctorId: null, permissionDomain: 'insight' });
      }
    },
  );
});
