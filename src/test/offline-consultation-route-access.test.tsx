import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClinicProtectedRoute } from '@/components/ClinicProtectedRoute';

const test = vi.hoisted(() => ({
  auth: {
    user: { id: 'ops-user' },
    loading: false,
    rolesLoading: false,
    role: 'ops_staff',
    isStaffOrAdmin: true,
    isOpsOrAdmin: true,
    isSpecialAdmin: false,
    isAdmin: false,
    isClinical: false,
    isLocum: false,
    isOpsStaff: true,
    canViewInsights: false,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => test.auth,
}));

function renderProtectedDetail(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/clinic/queue" element={<div>Queue page</div>} />
        <Route
          path="/clinic/consultation/:queueEntryId"
          element={
            <ClinicProtectedRoute requiredRole="clinical">
              <div>Offline consultation editor</div>
            </ClinicProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('offline consultation detail route access', () => {
  beforeEach(() => {
    test.auth.role = 'ops_staff';
    test.auth.isClinical = false;
    test.auth.isOpsStaff = true;
  });

  afterEach(cleanup);

  it('admits operations staff to the consultation detail only in explicit offline mode', () => {
    renderProtectedDetail('/clinic/consultation/queue-1?mode=offline');

    expect(screen.getByText('Offline consultation editor')).toBeInTheDocument();
    expect(screen.queryByText('Queue page')).not.toBeInTheDocument();
  });

  it('keeps normal consultation detail clinical-only for operations staff', () => {
    renderProtectedDetail('/clinic/consultation/queue-1');

    expect(screen.getByText('Queue page')).toBeInTheDocument();
    expect(screen.queryByText('Offline consultation editor')).not.toBeInTheDocument();
  });
});
