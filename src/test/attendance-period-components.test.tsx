import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceDecisionCards } from '@/components/clinic/dashboard/AttendanceDecisionCards';
import { AttendancePeriodDetails } from '@/components/clinic/dashboard/AttendancePeriodDetails';
import { AttendancePeriodHeatmap } from '@/components/clinic/dashboard/AttendancePeriodHeatmap';
import type { AttendancePeriodAnalysis, AttendancePeriodSummary } from '@/lib/clinic/attendancePeriodAnalysis';

function period(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, periodId: AttendancePeriodSummary['periodId']): AttendancePeriodSummary {
  const startHour = { morning: 8, afternoon: 12, evening: 16, night: 20 }[periodId];
  return {
    weekday,
    periodId,
    label: { morning: '8am–12pm', afternoon: '12pm–4pm', evening: '4pm–8pm', night: '8pm–12 midnight' }[periodId],
    startHour,
    endHour: startHour + 4,
    status: 'ready',
    expectedVisits: 8,
    lowerPrediction: 6,
    upperPrediction: 10,
    trafficLevel: 'moderate',
    confidence: 'high',
    safeForTraining: true,
    safetyReasons: [],
    hourly: Array.from({ length: 4 }, (_, index) => ({
      forecast: {
        weekday,
        hour: startHour + index,
        expectedVisits: 2,
        lowerPrediction: 1,
        upperPrediction: 3,
        observedAverage: 2,
        observedMedian: 2,
        observedPeak: 3,
        recentTrend: 0,
        sampleSize: 12,
        averageWaitMinutes: 10,
        waitMeasuredVisits: 12,
      },
      cell: null,
    })),
  };
}

const analysis: AttendancePeriodAnalysis = {
  periods: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => (['morning', 'afternoon', 'evening', 'night'] as const).map((periodId) => period(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7, periodId))),
  decisions: {
    offDay: { status: 'ready', title: 'Possible doctor off-day', weekday: 2, periodId: null, expectedVisits: 22, lowerPrediction: 18, upperPrediction: 27, confidence: 'high', reason: 'Lowest safety-score weekday.' },
    training: { status: 'ready', title: 'Best training window', weekday: 3, periodId: 'afternoon', expectedVisits: 8, lowerPrediction: 6, upperPrediction: 10, confidence: 'high', reason: 'Lowest safe regression period.' },
    peak: { status: 'ready', title: 'Peak staffing period', weekday: 6, periodId: 'evening', expectedVisits: 30, lowerPrediction: 24, upperPrediction: 39, confidence: 'moderate', reason: 'Highest regression-predicted period.' },
  },
};

describe('attendance period components', () => {
  it('renders three regression-backed decision cards', () => {
    render(<AttendanceDecisionCards decisions={analysis.decisions} />);

    expect(screen.getByText('Possible doctor off-day')).toBeInTheDocument();
    expect(screen.getByText('Best training window')).toBeInTheDocument();
    expect(screen.getByText('Peak staffing period')).toBeInTheDocument();
    expect(screen.getByText(/Lowest safe regression period/i)).toBeInTheDocument();
  });

  it('renders a readable Monday–Sunday four-period grid', () => {
    render(<AttendancePeriodHeatmap analysis={analysis} onSelectPeriod={vi.fn()} />);

    expect(screen.getByLabelText('Compact attendance heatmap')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Monday 8am–12pm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sunday 8pm–12 midnight/i })).toBeInTheDocument();
    expect(screen.getAllByText('8am–12pm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12pm–4pm').length).toBeGreaterThan(0);
  });

  it('opens clicked period details with all four hourly forecasts', () => {
    const selected = analysis.periods[0];
    render(<AttendancePeriodDetails period={selected} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('Monday 8am–12pm');
    expect(screen.getByRole('dialog')).toHaveTextContent('08:00–09:00');
    expect(screen.getByRole('dialog')).toHaveTextContent('11:00–12:00');
    expect(screen.getByRole('dialog')).toHaveTextContent('Predicted visits');
    expect(screen.getByRole('dialog')).toHaveTextContent('Observed peak');
  });

  it('calls the period selection handler without refitting data', () => {
    const onSelectPeriod = vi.fn();
    render(<AttendancePeriodHeatmap analysis={analysis} onSelectPeriod={onSelectPeriod} />);

    fireEvent.click(screen.getByRole('button', { name: /Tuesday 12pm–4pm/i }));
    expect(onSelectPeriod).toHaveBeenCalledWith(expect.objectContaining({ weekday: 2, periodId: 'afternoon' }));
  });
});
