import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { DoctorPerformanceTable } from '@/components/clinic/insight/performance/DoctorPerformanceTable';
import { ServicePerformanceTable } from '@/components/clinic/insight/performance/ServicePerformanceTable';

vi.mock('@/hooks/clinic/useInsightPerformanceDetail', () => ({
  useInsightPerformanceDetail: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const dates = {
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-31T00:00:00.000Z'),
};

describe('Clinic Insight responsive layout', () => {
  it('keeps the 390px shell width bounded while all four section tabs remain keyboard reachable', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    render(
      <InsightShell
        section="command"
        onSectionChange={vi.fn()}
        range={{ from: dates.startDate, to: dates.endDate }}
        onRangeChange={vi.fn()}
        comparisonEnabled={false}
        onComparisonChange={vi.fn()}
        onRefresh={vi.fn()}
        exportItems={[]}
        confidence="current period"
      >
        <div>Command Centre content</div>
      </InsightShell>,
    );

    expect(document.querySelector('[data-insight-shell]')).toHaveClass('max-w-full');
    expect(screen.getByRole('tablist', { name: 'Clinic Insight sections' })).toHaveClass('flex-wrap');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Command Centre',
      'Finance',
      'Performance',
      'Planning',
    ]);
  });

  it('renders mobile card alternatives for advanced performance tables without removing detail paths', () => {
    render(
      <>
        <DoctorPerformanceTable
          doctors={[{
            doctorId: 'doctor-a',
            doctorName: 'Dr Aina',
            completedVisits: 12,
            uniquePatients: 10,
            rosteredHours: 8,
            patientsPerHour: 1.5,
            visitBilling: 1200,
            revenuePerHour: 150,
            procedures: 3,
            documents: 2,
            missingAttribution: 0,
          }]}
          showFinancialColumns
          canOpenDoctor={() => true}
          onOpenDoctor={vi.fn()}
        />
        <ServicePerformanceTable
          services={[{
            serviceId: 'svc-1',
            serviceName: 'Wound dressing',
            volume: 5,
            uniquePatients: 4,
            revenue: 500,
            cogs: 100,
            profit: 400,
            marginPct: 80,
            averagePrice: 100,
            trendPct: 10,
            doctorCount: 2,
            missingCostCount: 0,
          }]}
          {...dates}
          viewerScope={{ userId: 'admin-user', reportsView: { allowed: true, version: 'v1' } }}
          filters={{ doctorId: null, paymentType: 'all', activityType: 'all', includeComparison: false }}
          canSeeNamedDoctors
        />
      </>,
    );

    const doctorCard = screen.getByTestId('doctor-performance-card');
    expect(doctorCard).toHaveTextContent('Visit billing');
    expect(within(doctorCard).getByRole('button', { name: 'View Dr Aina mobile performance details' })).toBeInTheDocument();

    const serviceCard = screen.getByTestId('service-performance-card');
    expect(serviceCard).toHaveTextContent('Revenue');
    expect(within(serviceCard).getByRole('button', { name: 'View Wound dressing mobile details' })).toBeInTheDocument();
  });
});
