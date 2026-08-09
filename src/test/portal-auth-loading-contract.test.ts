import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const authContext = readFileSync(
  resolve(process.cwd(), 'src/contexts/AuthContext.tsx'),
  'utf8',
);

describe('portal authentication loading', () => {
  it('keeps the mandatory role lookup independent from optional dashboard access', () => {
    expect(authContext).toContain('const fetchManagementDashboardAccess');

    const roleLoader = authContext.slice(
      authContext.indexOf('const fetchUserRole'),
      authContext.indexOf('const fetchManagementDashboardAccess'),
    );

    expect(roleLoader).not.toContain('can_view_management_dashboard');
    expect(roleLoader).not.toContain('setCanViewManagementDashboard');
  });

  it('tracks dashboard access loading separately from portal role loading', () => {
    expect(authContext).toContain('managementDashboardAccessLoading');
    expect(authContext).toContain('setManagementDashboardAccessLoading');
  });
});
