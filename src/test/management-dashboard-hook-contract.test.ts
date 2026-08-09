import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('management dashboard hooks', () => {
  it('keeps automatic and manual data on independent month-scoped keys', () => {
    const source = readFileSync('src/hooks/clinic/useManagementDashboard.ts', 'utf8');
    expect(source).toContain("['clinic', 'management-dashboard', 'report', monthStart]");
    expect(source).toContain("['clinic', 'management-dashboard', 'manual', monthStart]");
    expect(source).toContain("get_management_dashboard");
    expect(source).toContain("set_management_dashboard_metric");
    expect(source).toContain("delete_management_dashboard_metric");
  });
});
