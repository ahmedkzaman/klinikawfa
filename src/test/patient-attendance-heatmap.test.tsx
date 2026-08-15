import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAttendanceHeatmap = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({
  attendancePresetRange: vi.fn(({ preset }: { preset: string }) => preset === 'custom'
    ? { startDate: '2026-08-10', endDate: '2026-08-15' }
    : { startDate: '2026-05-25', endDate: '2026-08-16' }),
  useAttendanceHeatmap,
}));

import { PatientAttendanceHeatmap } from '@/components/clinic/dashboard/PatientAttendanceHeatmap';

const report = {
  period: {
    startDate: '2026-05-25', endDate: '2026-08-16',
    comparisonStartDate: '2026-03-02', comparisonEndDate: '2026-05-24', timezone: 'Asia/Kuala_Lumpur' as const,
  },
  doctors: [{ id: 'doctor-1', name: 'Dr Aina' }],
  warnings: ['Roster coverage is incomplete for some periods.'],
  cells: [
    {
      weekday: 1 as const, hour: 8, totalVisits: 16, operatingOccurrences: 8,
      averageVisits: 2, medianVisits: 2, peakVisits: 4, averageWaitMinutes: 50,
      waitMeasuredVisits: 6, comparisonAverageVisits: 1, comparisonAbsoluteChange: 1,
      comparisonPercentChange: 100, otherDoctorCoveredOccurrences: 0,
      dates: [{ date: '2026-06-01', visits: 3, averageWaitMinutes: 45 }], coverage: 'complete' as const,
    },
    {
      weekday: 1 as const, hour: 9, totalVisits: 0, operatingOccurrences: 0,
      averageVisits: null, medianVisits: null, peakVisits: null, averageWaitMinutes: null,
      waitMeasuredVisits: 0, comparisonAverageVisits: null, comparisonAbsoluteChange: null,
      comparisonPercentChange: null, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'uncovered' as const,
    },
    {
      weekday: 1 as const, hour: 10, totalVisits: 8, operatingOccurrences: 4,
      averageVisits: 2, medianVisits: 2, peakVisits: 2, averageWaitMinutes: 10,
      waitMeasuredVisits: 4, comparisonAverageVisits: 1, comparisonAbsoluteChange: 1,
      comparisonPercentChange: 100, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'insufficient' as const,
    },
    {
      weekday: 2 as const, hour: 8, totalVisits: 0, operatingOccurrences: 8,
      averageVisits: 0, medianVisits: 0, peakVisits: 0, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: -1,
      comparisonPercentChange: -100, otherDoctorCoveredOccurrences: 8, dates: [], coverage: 'complete' as const,
    },
    {
      weekday: 2 as const, hour: 9, totalVisits: 8, operatingOccurrences: 8,
      averageVisits: 1, medianVisits: 1, peakVisits: 1, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: 0,
      comparisonPercentChange: 0, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'complete' as const,
    },
    {
      weekday: 2 as const, hour: 10, totalVisits: 8, operatingOccurrences: 8,
      averageVisits: 1, medianVisits: 1, peakVisits: 1, averageWaitMinutes: 5,
      waitMeasuredVisits: 8, comparisonAverageVisits: 1, comparisonAbsoluteChange: 0,
      comparisonPercentChange: 0, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'complete' as const,
    },
  ],
};

describe('PatientAttendanceHeatmap', () => {
  beforeEach(() => {
    useAttendanceHeatmap.mockReturnValue({ data: report, isLoading: false, isError: false, error: null });
  });

  it('renders an accessible Monday–Sunday, 08:00–00:00 heatmap with colour-independent statuses', () => {
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByRole('heading', { name: /patient attendance heatmap/i })).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('08:00–09:00')).toBeInTheDocument();
    expect(screen.getByText('23:00–00:00')).toBeInTheDocument();
    expect(screen.getAllByText(/Closed \/ not operating/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uncovered roster gap/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Insufficient data/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Covered average/i).length).toBeGreaterThan(0);
    const alertCell = screen.getByRole('button', { name: /Monday 08:00–09:00.*2.*wait alert/i });
    expect(alertCell).toHaveClass('ring-red-600');
    expect(alertCell.className).toMatch(/bg-blue-/);
  });

  it('lets users filter by period and treating doctor', () => {
    render(<PatientAttendanceHeatmap />);

    fireEvent.change(screen.getByLabelText(/attendance period/i), { target: { value: 'month' } });
    expect(useAttendanceHeatmap.mock.calls.at(-1)?.[0]).toMatchObject({ doctorId: null });
    fireEvent.change(screen.getByLabelText(/treating doctor/i), { target: { value: 'doctor-1' } });
    expect(useAttendanceHeatmap.mock.calls.at(-1)?.[0]).toMatchObject({ doctorId: 'doctor-1' });
    expect(screen.getByText(/selected treating doctor/i)).toBeInTheDocument();
  });

  it('opens a focused details dialog with aggregate evidence and no patient identifiers', () => {
    render(<PatientAttendanceHeatmap />);

    const cell = screen.getByRole('button', { name: /Monday 08:00–09:00.*2.*wait alert/i });
    fireEvent.click(cell);
    const dialog = screen.getByRole('dialog', { name: /attendance cell details/i });
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus();
    expect(dialog).toHaveTextContent(/Total visits:\s*16/i);
    expect(dialog).toHaveTextContent(/Average:\s*2/i);
    expect(dialog).toHaveTextContent(/Median:\s*2/i);
    expect(dialog).toHaveTextContent(/Peak:\s*4/i);
    expect(dialog).toHaveTextContent(/Operating-date sample:\s*8/i);
    expect(dialog).toHaveTextContent(/Average wait:\s*50/i);
    expect(dialog).toHaveTextContent(/Measured waits:\s*6/i);
    expect(dialog).toHaveTextContent(/Comparison:\s*\+1.*100%/i);
    expect(dialog).toHaveTextContent(/2026-06-01:\s*3/i);
    expect(dialog).not.toHaveTextContent(/patient|name|ic number/i);
  });

  it('renders deterministic recommendations with their evidence and suggestion label', () => {
    render(<PatientAttendanceHeatmap />);

    expect(screen.getByRole('heading', { name: /recommendations/i })).toBeInTheDocument();
    expect(screen.getByText(/Training window/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Peak staffing/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Possible doctor off-day.*suggestion only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
  });

  it.each([
    ['loading', { data: undefined, isLoading: true, isError: false, error: null }, /loading attendance heatmap/i],
    ['error', { data: undefined, isLoading: false, isError: true, error: new Error('Unavailable'), }, /unavailable/i],
    ['empty', { data: { ...report, hasAttendanceData: false, cells: Array.from({ length: 112 }, (_, index) => ({
      weekday: (Math.floor(index / 16) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      hour: (index % 16) + 8, totalVisits: 0, operatingOccurrences: 0,
      averageVisits: null, medianVisits: null, peakVisits: null, averageWaitMinutes: null,
      waitMeasuredVisits: 0, comparisonAverageVisits: null, comparisonAbsoluteChange: null,
      comparisonPercentChange: null, otherDoctorCoveredOccurrences: 0, dates: [], coverage: 'uncovered' as const,
    })) }, isLoading: false, isError: false, error: null }, /no attendance data/i],
  ])('shows the %s state', (_name, query, expected) => {
    useAttendanceHeatmap.mockReturnValue(query);
    render(<PatientAttendanceHeatmap />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows an invalid-range message before querying invalid custom dates', () => {
    render(<PatientAttendanceHeatmap />);

    fireEvent.change(screen.getByLabelText(/attendance period/i), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText(/custom start date/i), { target: { value: '2026-08-16' } });
    fireEvent.change(screen.getByLabelText(/custom end date/i), { target: { value: '2026-08-15' } });
    expect(screen.getByText(/invalid date range/i)).toBeInTheDocument();
  });
});
