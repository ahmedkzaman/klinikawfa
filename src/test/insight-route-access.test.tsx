import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const test = vi.hoisted(() => ({
  auth: vi.fn(),
  command: vi.fn(),
  finance: vi.fn(),
  performance: vi.fn(),
  planning: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: test.auth }));
vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({
  ClinicHealthTab: () => { test.command(); return <div>command source</div>; },
}));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({
  FinanceTab: () => { test.finance(); return <div>finance source</div>; },
}));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({
  PlanningTab: () => { test.planning(); return <div>planning source</div>; },
}));
vi.mock('@/components/clinic/insight/performance/PerformanceTab', () => ({
  PerformanceTab: (props: {
    access: { ownDoctorId: string | null };
    viewerScope: { reportsView: { version: string } };
  }) => {
    test.performance(props);
    return (
      <output aria-label="Resident performance scope">
        doctor={props.access.ownDoctorId};version={props.viewerScope.reportsView.version}
      </output>
    );
  },
}));

import { InsightRoute } from '@/pages/clinic/Insight';
import { ClinicProtectedRoute } from '@/components/ClinicProtectedRoute';

const allowedResident = {
  role: 'resident_doctor',
  user: { id: 'resident-account' },
  rolesLoading: false,
  canViewInsights: true,
  insightAccessLoading: false,
  insightDoctorId: 'doctor-resident-actual',
  insightPermissionVersion: 'resident:allowed:v2',
  canViewManagementDashboard: false,
  managementDashboardAccessLoading: false,
};

function renderRoute() {
  return render(<MemoryRouter initialEntries={['/clinic/insight?section=performance']}><InsightRoute /></MemoryRouter>);
}

describe('Clinic Insight authoritative route access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/clinic/insight?section=performance');
    test.auth.mockReturnValue(allowedResident);
  });

  it('does not mount any Insight source while effective reports.view is unresolved', () => {
    test.auth.mockReturnValue({ ...allowedResident, canViewInsights: false, insightAccessLoading: true });

    renderRoute();

    expect(screen.getByRole('status')).toHaveTextContent('Checking Clinic Insight access');
    expect(test.command).not.toHaveBeenCalled();
    expect(test.finance).not.toHaveBeenCalled();
    expect(test.performance).not.toHaveBeenCalled();
    expect(test.planning).not.toHaveBeenCalled();
  });

  it('keeps the outer clinic route on its access loader until reports.view resolves', () => {
    test.auth.mockReturnValue({
      ...allowedResident,
      loading: false,
      isStaffOrAdmin: true,
      isOpsOrAdmin: true,
      isSpecialAdmin: false,
      isAdmin: false,
      isClinical: true,
      isLocum: false,
      canViewInsights: false,
      insightAccessLoading: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/clinic/insight']}>
        <ClinicProtectedRoute requiredRole="insights"><div>protected insight child</div></ClinicProtectedRoute>
      </MemoryRouter>,
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('protected insight child')).not.toBeInTheDocument();
  });

  it('does not mount any Insight source after an explicit account denial', () => {
    test.auth.mockReturnValue({ ...allowedResident, canViewInsights: false });

    renderRoute();

    expect(screen.queryByRole('heading', { name: 'Clinic Insight' })).not.toBeInTheDocument();
    expect(test.command).not.toHaveBeenCalled();
    expect(test.finance).not.toHaveBeenCalled();
    expect(test.performance).not.toHaveBeenCalled();
    expect(test.planning).not.toHaveBeenCalled();
  });

  it('passes the actual resident doctor identity and permission version to Performance', () => {
    renderRoute();

    expect(screen.getByLabelText('Resident performance scope')).toHaveTextContent(
      'doctor=doctor-resident-actual;version=resident:allowed:v2',
    );
  });
});
