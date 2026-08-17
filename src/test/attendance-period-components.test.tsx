import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceDecisionCards } from '@/components/clinic/dashboard/AttendanceDecisionCards';
import { AttendancePeriodDetails } from '@/components/clinic/dashboard/AttendancePeriodDetails';
import { AttendancePeriodHeatmap } from '@/components/clinic/dashboard/AttendancePeriodHeatmap';
import type { AttendancePeriodAnalysis, AttendancePeriodSummary } from '@/lib/clinic/attendancePeriodAnalysis';

function period(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, periodId: AttendancePeriodSummary['periodId']): AttendancePeriodSummary {
  const startHour = { '08_12': 8, '12_16': 12, '16_20': 16, '20_24': 20 }[periodId];
  return {
    weekday,
    periodId,
    label: { '08_12': '08:00-12:00', '12_16': '12:00-16:00', '16_20': '16:00-20:00', '20_24': '20:00-00:00' }[periodId],
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
  periods: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => (['08_12', '12_16', '16_20', '20_24'] as const).map((periodId) => period(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7, periodId))),
  decisions: {
    offDay: { status: 'ready', title: 'Possible doctor off-day', weekday: 2, periodId: null, expectedVisits: 22, lowerPrediction: 18, upperPrediction: 27, confidence: 'high', reason: 'Lowest safety-score weekday.' },
    training: { status: 'ready', title: 'Best training window', weekday: 3, periodId: '12_16', expectedVisits: 8, lowerPrediction: 6, upperPrediction: 10, confidence: 'high', reason: 'Lowest safe regression period.' },
    peak: { status: 'ready', title: 'Peak staffing period', weekday: 6, periodId: '16_20', expectedVisits: 30, lowerPrediction: 24, upperPrediction: 39, confidence: 'moderate', reason: 'Highest regression-predicted period.' },
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
    expect(screen.getByRole('button', { name: /Monday 08:00.*12:00/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sunday 20:00.*00:00/i })).toBeInTheDocument();
    expect(screen.getAllByText('08:00–12:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12:00–16:00').length).toBeGreaterThan(0);
  });

  it('opens clicked period details with all four hourly forecasts', () => {
    const selected = analysis.periods[0];
    render(<AttendancePeriodDetails period={selected} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('Monday 08:00–12:00');
    expect(screen.getByRole('dialog')).toHaveTextContent('08:00–09:00');
    expect(screen.getByRole('dialog')).toHaveTextContent('11:00–12:00');
    expect(screen.getByRole('dialog')).toHaveTextContent('Predicted visits');
    expect(screen.getByRole('dialog')).toHaveTextContent('Observed peak');
  });

  it('calls the period selection handler without refitting data', () => {
    const onSelectPeriod = vi.fn();
    render(<AttendancePeriodHeatmap analysis={analysis} onSelectPeriod={onSelectPeriod} />);

    fireEvent.click(screen.getByRole('button', { name: /Tuesday 12:00.*16:00/i }));
    expect(onSelectPeriod).toHaveBeenCalledWith(expect.objectContaining({ weekday: 2, periodId: '12_16' }));
  });
});
