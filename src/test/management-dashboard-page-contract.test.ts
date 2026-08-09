import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('management dashboard page contract', () => {
  it('renders all command-centre modules and confidence labels', () => {
    const source = [
      'src/pages/clinic/ManagementDashboard.tsx',
      'src/components/clinic/dashboard/FinancialOperationsPanel.tsx',
      'src/components/clinic/dashboard/StockInventoryPanel.tsx',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(source).toContain('Management Dashboard');
    expect(source).toContain('Financial &amp; Operations');
    expect(source).toContain('Stock &amp; Inventory');
    expect(source).toContain('Daily patient &amp; waiting trend');
    expect(source).toContain('Growth & Marketing');
    expect(source).toContain('Governance & Operational Cadence');
    expect(source).toContain('canEditManagementDashboard');
    expect(source).toContain('Edit revenue target');
    expect(source).toContain('Enter stock purchases');
  });

  it('protects the route from locum and leaves Insight unchanged', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const layout = readFileSync('src/components/clinic/ClinicLayout.tsx', 'utf8');
    expect(app).toMatch(/path="dashboard"[\s\S]*requiredRole="non_locum_staff"/);
    expect(layout).toContain("label: 'Management Dashboard'");
    expect(layout).toMatch(/label: 'Insight',[\s\S]*adminOnly: true/);
  });
});
