import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';
import { OperationalCalendar } from '@/components/clinic/insight/planning/OperationalCalendar';

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

describe('Insight Management boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/clinic/insight');
  });

  it('does not embed Management as an Insight tab anymore', () => {
    render(<Insight />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Command Centre',
      'Finance',
      'Performance',
      'Planning',
    ]);
    expect(screen.queryByRole('tab', { name: 'Management' })).not.toBeInTheDocument();
    expect(screen.queryByText(/financial control summary unavailable/i)).not.toBeInTheDocument();
  });

  it('keeps Management Dashboard as a standalone destination from planning cadence', () => {
    render(
      <OperationalCalendar
        decisions={{
          training: { status: 'ready', title: 'Training', weekday: 1, periodId: '12_16', reason: 'Lowest safe demand.', expectedVisits: 4, lowerPrediction: 2, upperPrediction: 6, confidence: 'high' },
          offDay: { status: 'unavailable', title: 'Off day', weekday: null, periodId: null, reason: 'No candidate.', expectedVisits: null, lowerPrediction: null, upperPrediction: null, confidence: 'insufficient' },
          peak: { status: 'ready', title: 'Peak cover', weekday: 5, periodId: '20_24', reason: 'Highest demand.', expectedVisits: 9, lowerPrediction: 7, upperPrediction: 12, confidence: 'high' },
        }}
        regression={{ status: 'ready', diagnostics: { usableWeeks: 12 }, weekdays: [] } as never}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open Management Dashboard' })).toHaveAttribute('href', '/clinic/dashboard');
  });
});
