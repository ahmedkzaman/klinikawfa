import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({ useAuth: useAuthMock }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({
  FinanceTab: ({ canViewAdvanced, canSeeNamedDoctors }: { canViewAdvanced: boolean; canSeeNamedDoctors: boolean }) => (
    <output aria-label="Finance access">advanced={String(canViewAdvanced)};named={String(canSeeNamedDoctors)}</output>
  ),
}));
vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({ ClinicHealthTab: () => null }));
vi.mock('@/components/clinic/insight/performance/PerformanceTab', () => ({ PerformanceTab: () => null }));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({ PlanningTab: () => null }));

import { InsightRoute } from '@/pages/clinic/Insight';

function renderInsightRoute() {
  return render(
    <MemoryRouter initialEntries={['/clinic/insight?section=finance']}>
      <InsightRoute />
    </MemoryRouter>,
  );
}

describe('Advanced Finance account and role access', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/clinic/insight?section=finance');
    useAuthMock.mockReturnValue({
      role: 'doctor_admin',
      user: { id: 'doctor-admin' },
      rolesLoading: false,
      canViewInsights: true,
      insightAccessLoading: false,
      insightDoctorId: null,
      insightPermissionVersion: 'doctor-admin:v1',
      canViewManagementDashboard: false,
      managementDashboardAccessLoading: false,
    });
  });

  it('honours an explicit account denial even for a role with default management access', () => {
    renderInsightRoute();
    expect(screen.getByLabelText('Finance access')).toHaveTextContent('advanced=false;named=true');
  });

  it('allows Advanced Finance while redacting doctor names for a granted non-named role', () => {
    useAuthMock.mockReturnValue({
      role: 'admin',
      user: { id: 'admin-account' },
      rolesLoading: false,
      canViewInsights: true,
      insightAccessLoading: false,
      insightDoctorId: null,
      insightPermissionVersion: 'admin:v1',
      canViewManagementDashboard: true,
      managementDashboardAccessLoading: false,
    });
    renderInsightRoute();
    expect(screen.getByLabelText('Finance access')).toHaveTextContent('advanced=true;named=false');
  });
});
