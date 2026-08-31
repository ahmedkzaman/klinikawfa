import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ role: 'special_admin' as string | null, isAdmin: false, isDoctorAdmin: false }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      role: authState.role,
      isAdmin: authState.isAdmin,
      isDoctorAdmin: authState.isDoctorAdmin,
      user: { id: 'u-owner' },
    })),
  };
});

vi.mock('@/hooks/clinic/useClinicUsers', () => ({
  useClinicUsers: vi.fn(() => ({
    data: [
      {
        id: 'u-ammar',
        full_name: 'Muhammad Ammar Harith',
        email: 'ammar@t.l',
        phone: null,
        mmc_number: null,
        requested_role: null,
        role: 'ops_staff',
        doctor: null,
      },
      {
        id: 'u-ahmed',
        full_name: 'Ahmed bin Kamarulzaman',
        email: 'ahmedkzaman@gmail.com',
        phone: null,
        mmc_number: null,
        requested_role: null,
        role: 'special_admin',
        doctor: null,
      },
    ],
    isLoading: false,
  })),
}));

const matrixRows = [
  { role: 'admin', permission_key: 'access.manage_permissions', allowed: true },
  { role: 'admin', permission_key: 'billing.manage', allowed: true },
  { role: 'special_admin', permission_key: 'billing.manage', allowed: true },
  { role: 'special_admin', permission_key: 'procurement.approve', allowed: true },
  { role: 'locum', permission_key: 'billing.manage', allowed: false },
  { role: 'ops_staff', permission_key: 'patients.view', allowed: true },
];

const userDetailRows = [
  {
    permission_key: 'patients.view',
    role_allowed: true,
    override_allowed: null,
    effective_allowed: true,
    updated_at: null,
    updated_by: null,
  },
  {
    permission_key: 'billing.manage',
    role_allowed: false,
    override_allowed: true,
    effective_allowed: true,
    updated_at: '2026-08-30T09:00:00Z',
    updated_by: 'u-owner',
  },
];

function setupRpc() {
  rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
    if (fn === 'get_clinic_permission_matrix') {
      return Promise.resolve({ data: matrixRows, error: null });
    }
    if (fn === 'has_clinic_permission') {
      return Promise.resolve({ data: args?._permission_key === 'access.manage_permissions', error: null });
    }
    if (fn === 'can_manage_clinic_permissions') {
      return Promise.resolve({ data: true, error: null });
    }
    if (fn === 'get_clinic_user_permission_details') {
      return Promise.resolve({ data: userDetailRows, error: null });
    }
    if (fn === 'set_clinic_permission') {
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'set_clinic_user_permission_override') {
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'reset_clinic_user_permission_override') {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

import ClinicPermissionsSettings from '@/pages/clinic/settings/ClinicPermissionsSettings';
import type { UserPermissionDetail } from '@/pages/clinic/settings/ClinicPermissionsSettings';

type UserPermissionDetailLike = UserPermissionDetail;

function renderPage(initialUrl = '/clinic/settings/permissions') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <ClinicPermissionsSettings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.role = 'special_admin';
  authState.isAdmin = false;
  authState.isDoctorAdmin = false;
  setupRpc();
});

describe('ClinicPermissionsSettings — registry completeness', () => {
  it('exposes the procurement approval permission row', async () => {
    renderPage();
    await screen.findByText('Approve purchase orders');
  });

  it('renders a column for every operational role including special_admin', async () => {
    renderPage();
    await screen.findByText('Manage permissions');
    for (const label of ['Admin', 'Doctor Admin', 'Special Admin', 'Resident Doctor', 'Locum', 'Operations Staff', 'Operations', 'Purchaser', 'Staff Nurse', 'Staff']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
  });

  it('documents what each permission unlocks', async () => {
    renderPage();
    await screen.findByText('Approve purchase orders');
    expect(screen.getByTitle(/approve purchase orders above the routine limit/i)).toBeInTheDocument();
    expect(screen.getByTitle(/invoices, payments, discounts/i)).toBeInTheDocument();
  });
});

describe('ClinicPermissionsSettings — database-driven access gate', () => {
  it('lets a special_admin owner onto the page when the DB grants manage-permissions', async () => {
    renderPage();
    // DB says yes even though isAdmin/isDoctorAdmin are false.
    await waitFor(
      () => expect(screen.getByText('Role Permissions')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByText(/access required/i)).not.toBeInTheDocument();
  });

  it('still blocks users the database denies', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'has_clinic_permission') return Promise.resolve({ data: false, error: null });
      if (fn === 'can_manage_clinic_permissions') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/access required/i)).toBeInTheDocument(), { timeout: 4000 });
  });
});

describe('ClinicPermissionsSettings — audit trail', () => {
  it('shows when an account override was last changed', async () => {
    const { AccountPermissionsTable } = await import('@/pages/clinic/settings/ClinicPermissionsSettings');
    const details: Record<string, UserPermissionDetailLike> = {
      'billing.manage': {
        permission_key: 'billing.manage',
        role_allowed: false,
        override_allowed: true,
        effective_allowed: true,
        updated_at: new Date(Date.now() - 3600_000).toISOString(),
        updated_by: 'u-owner',
      },
    };
    render(
      <AccountPermissionsTable
        user={{ full_name: 'Muhammad Ammar Harith', email: 'ammar@t.l', role: 'ops_staff' }}
        details={details}
        pending={null}
        onOverride={() => {}}
      />,
    );
    expect(screen.getByText('Manage billing')).toBeInTheDocument();
    const timeEl = screen.getByText(/updated/i).querySelector('time');
    expect(timeEl).not.toBeNull();
    expect(timeEl!.getAttribute('datetime')).toBeTruthy();
  });

});

describe('ClinicPermissionsSettings — sensitive grants', () => {
  it('asks for confirmation before granting billing.manage and rolls back on cancel', async () => {
    renderPage();
    await screen.findByText('Manage permissions');
    // find the locum row cell for billing.manage: locate row by permission label
    const row = screen.getByText('Manage billing').closest('tr');
    expect(row).not.toBeNull();
    const locumHeader = screen.getByRole('columnheader', { name: 'Locum' });
    const table = row!.closest('table')!;
    const colIdx = Array.from(table.querySelectorAll('thead th')).findIndex(
      (th) => th.textContent === 'Locum',
    );
    const cell = (row as HTMLElement).children[colIdx] as HTMLElement;
    const sw = within(cell).getByRole('switch') as HTMLButtonElement;
    fireEvent.click(sw);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/locum/i)).toBeInTheDocument();
    // cancel -> stays unchecked
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(sw.getAttribute('data-state')).toBe('unchecked');
    expect(rpc).not.toHaveBeenCalledWith(
      'set_clinic_permission',
      expect.objectContaining({ _permission_key: 'billing.manage', _allowed: true }),
    );
  });

  it('disables only the pending cell while saving (per-cell pending state)', async () => {
    let resolveSet: (v: unknown) => void = () => {};
    rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'get_clinic_permission_matrix') return Promise.resolve({ data: matrixRows, error: null });
      if (fn === 'has_clinic_permission') return Promise.resolve({ data: true, error: null });
      if (fn === 'set_clinic_permission') {
        return new Promise((resolve) => { resolveSet = resolve; });
      }
      return Promise.resolve({ data: [], error: null });
    });
    renderPage();
    await screen.findByText('View patients');
    const row = screen.getByText('View patients').closest('tr') as HTMLElement;
    const table = row.closest('table')!;
    const colIdx = Array.from(table.querySelectorAll('thead th')).findIndex((th) => th.textContent === 'Locum');
    const cell = row.children[colIdx] as HTMLElement;
    const sw = within(cell).getByRole('switch') as HTMLButtonElement;
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toBeDisabled());
    // other switches remain enabled
    const otherCell = row.children[1] as HTMLElement;
    const otherSw = within(otherCell).getByRole('switch') as HTMLButtonElement;
    expect(otherSw).toBeEnabled();
    resolveSet({ data: null, error: null });
    await waitFor(() => expect(sw).toBeEnabled());
  });
});

describe('ClinicPermissionsSettings — sticky header column', () => {
  it('makes the permission label column sticky', async () => {
    renderPage();
    await screen.findByText('Manage permissions');
    const th = screen.getByRole('columnheader', { name: 'Permission' });
    expect(th.className).toContain('sticky');
  });
});
