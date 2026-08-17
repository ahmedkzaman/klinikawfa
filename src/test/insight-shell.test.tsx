import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';

const { useFinancialInsightsMock, useSalesInsightsMock, usePanelBilledInsightsMock } = vi.hoisted(() => ({
  useFinancialInsightsMock: vi.fn(),
  useSalesInsightsMock: vi.fn(),
  usePanelBilledInsightsMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useFinancialInsights', () => ({ useFinancialInsights: useFinancialInsightsMock }));
vi.mock('@/hooks/clinic/useSalesInsights', () => ({ useSalesInsights: useSalesInsightsMock }));
vi.mock('@/hooks/clinic/usePanelBilledInsights', () => ({ usePanelBilledInsights: usePanelBilledInsightsMock }));
vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({ ClinicHealthTab: () => null }));
vi.mock('@/components/clinic/insight/finance/FinanceTab', () => ({ FinanceTab: () => null }));
vi.mock('@/components/clinic/insight/performance/PerformanceTab', () => ({ PerformanceTab: () => null }));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({ PlanningTab: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

describe('Clinic Insight shell', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/clinic/insight');
    const emptyResult = { data: undefined, isLoading: false, isError: false, error: null };
    useFinancialInsightsMock.mockReturnValue(emptyResult);
    useSalesInsightsMock.mockReturnValue(emptyResult);
    usePanelBilledInsightsMock.mockReturnValue(emptyResult);
  });

  it('persists an active section in the URL and exposes the shared export menu', () => {
    render(<Insight initialSearch="?section=performance" />);

    expect(screen.getByRole('heading', { name: 'Clinic Insight' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Performance' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Finance' }));

    expect(window.location.search).toContain('section=finance');
    expect(screen.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  it('keeps the selected tab synchronized with browser navigation and keyboard selection', () => {
    render(<Insight initialSearch="?section=command" />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Command Centre' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true');

    act(() => {
      window.history.pushState({}, '', '/clinic/insight?section=planning');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('aria-selected', 'true');
  });

  it('roves tab focus and selection with every horizontal and boundary key', () => {
    render(<Insight initialSearch="?section=command" />);

    const command = screen.getByRole('tab', { name: 'Command Centre' });
    const finance = screen.getByRole('tab', { name: 'Finance' });
    const performance = screen.getByRole('tab', { name: 'Performance' });
    const planning = screen.getByRole('tab', { name: 'Planning' });

    expect(command).toHaveAttribute('tabindex', '0');
    expect(finance).toHaveAttribute('tabindex', '-1');
    expect(performance).toHaveAttribute('tabindex', '-1');
    expect(planning).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(command, { key: 'ArrowRight' });
    expect(finance).toHaveFocus();
    expect(finance).toHaveAttribute('aria-selected', 'true');
    expect(finance).toHaveAttribute('tabindex', '0');
    expect(command).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(finance, { key: 'ArrowLeft' });
    expect(command).toHaveFocus();
    expect(command).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(command, { key: 'End' });
    expect(planning).toHaveFocus();
    expect(planning).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(planning, { key: 'Home' });
    expect(command).toHaveFocus();
    expect(command).toHaveAttribute('aria-selected', 'true');
  });

  it('links each selected tab to its active tabpanel', () => {
    render(<Insight initialSearch="?section=command" />);

    for (const [label, section] of [
      ['Command Centre', 'command'],
      ['Finance', 'finance'],
      ['Performance', 'performance'],
      ['Planning', 'planning'],
    ] as const) {
      const tab = screen.getByRole('tab', { name: label });
      fireEvent.click(tab);
      const panel = screen.getByRole('tabpanel', { name: label });
      expect(tab).toHaveAttribute('id', `clinic-insight-tab-${section}`);
      expect(tab).toHaveAttribute('aria-controls', `clinic-insight-panel-${section}`);
      expect(panel).toHaveAttribute('id', `clinic-insight-panel-${section}`);
      expect(panel).toHaveAttribute('aria-labelledby', `clinic-insight-tab-${section}`);
    }
  });
});
