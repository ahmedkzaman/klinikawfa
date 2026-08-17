import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';

const performanceTabMock = vi.hoisted(() => vi.fn(() => <div>Secured performance workspace</div>));
vi.mock('@/components/clinic/insight/performance/PerformanceTab', () => ({ PerformanceTab: performanceTabMock }));
vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({ ClinicHealthTab: () => null }));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({ FinanceTab: () => null }));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({ PlanningTab: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

describe('Insight panel-billed presentation boundary', () => {
  it('keeps the legacy panel card out of Performance and mounts the secured workspace', () => {
    render(<Insight initialSearch="?section=performance" />);

    expect(screen.getByText('Secured performance workspace')).toBeInTheDocument();
    expect(screen.queryByText('Panel Billed')).not.toBeInTheDocument();
    expect(performanceTabMock).toHaveBeenCalledTimes(1);
  });
});
