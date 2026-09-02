import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = vi.hoisted(() => ({
  role: 'ops_staff' as string | null,
  isAdmin: false,
  isSpecialAdmin: false,
  isStaffOrAdmin: true,
  isOpsOrAdmin: true,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: true, error: null })), from: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      role: authState.role,
      isAdmin: authState.isAdmin,
      isSpecialAdmin: authState.isSpecialAdmin,
      isStaffOrAdmin: authState.isStaffOrAdmin,
      isOpsOrAdmin: authState.isOpsOrAdmin,
      user: { id: 'u-1' },
    })),
  };
});

import { StaffAdminRoute } from '@/components/staff/StaffAdminRoute';

describe('StaffAdminRoute', () => {
  beforeEach(() => {
    authState.role = 'ops_staff';
    authState.isAdmin = false;
    authState.isSpecialAdmin = false;
  });

  it('renders children for admin', () => {
    authState.isAdmin = true;
    render(
      <MemoryRouter>
        <StaffAdminRoute>
          <div>payroll summary content</div>
        </StaffAdminRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('payroll summary content')).toBeInTheDocument();
  });

  it('renders children for special_admin', () => {
    authState.isSpecialAdmin = true;
    render(
      <MemoryRouter>
        <StaffAdminRoute>
          <div>roster editor</div>
        </StaffAdminRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('roster editor')).toBeInTheDocument();
  });

  it('redirects plain staff away from admin pages', () => {
    authState.isAdmin = false;
    authState.isSpecialAdmin = false;
    render(
      <MemoryRouter>
        <StaffAdminRoute>
          <div>payroll summary content</div>
        </StaffAdminRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText('payroll summary content')).not.toBeInTheDocument();
  });
});
