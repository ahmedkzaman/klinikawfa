import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';

vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({
  ClinicHealthTab: () => <div>Command Centre content</div>,
}));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({
  FinanceTab: () => <div>Finance content</div>,
}));
vi.mock('@/components/clinic/insight/performance/PerformanceTab', () => ({
  PerformanceTab: () => <div>Performance content</div>,
}));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({
  PlanningTab: () => <div>Planning content</div>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

describe('Clinic Insight information architecture', () => {
  it('exposes exactly the four approved top-level sections', () => {
    window.history.replaceState({}, '', '/clinic/insight');

    render(<Insight />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Command Centre',
      'Finance',
      'Performance',
      'Planning',
    ]);
    expect(screen.queryByRole('tab', { name: 'Leaderboards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Scoreboards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Management' })).not.toBeInTheDocument();
    expect(screen.queryByText(/clinic health score/i)).not.toBeInTheDocument();
  });
});
