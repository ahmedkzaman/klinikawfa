import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoreboardsTab } from '@/components/clinic/insight/ScoreboardsTab';

const { useScoreboardsMock, useDoctorClinicalActivityMock } = vi.hoisted(() => ({
  useScoreboardsMock: vi.fn(),
  useDoctorClinicalActivityMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useScoreboards', () => ({
  useScoreboards: useScoreboardsMock,
}));

vi.mock('@/hooks/clinic/useDoctorClinicalActivity', () => ({
  useDoctorClinicalActivity: useDoctorClinicalActivityMock,
}));

const dates = {
  startDate: new Date('2026-07-01T00:00:00.000Z'),
  endDate: new Date('2026-07-31T00:00:00.000Z'),
};

beforeEach(() => {
  useScoreboardsMock.mockReturnValue({
    data: { doctors: [], topDiagnoses: [], topMedications: [], procedureRoi: [] },
    isLoading: false,
    isError: false,
    error: null,
  });
  useDoctorClinicalActivityMock.mockReturnValue({
    data: [{
      doctorId: 'doctor-a', doctorName: 'Dr A', procedures: 1, mc: 0, quarantine: 0,
      referral: 0, totalDocuments: 0,
      rows: [{
        activityId: 'procedure-a', activityKind: 'procedure', activityDate: '2026-07-27',
        activityName: 'Dressing', consultationId: 'consultation-a', queueEntryId: 'queue-a',
        queueCreatedAt: '2026-07-27T09:00:00.000Z', queueSequence: 1, doctorId: 'doctor-a',
        doctorName: 'Dr A', patientName: 'Aminah Patient',
      }],
    }],
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('ScoreboardsTab doctor clinical activity integration', () => {
  it('keeps doctor clinical activity visible when legacy scoreboards have no data', () => {
    render(<ScoreboardsTab {...dates} />);

    expect(screen.getByText('No scoreboard data')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Doctor Clinical Activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dr A' })).toBeInTheDocument();
  });

  it('keeps the child error visible while legacy scoreboards are loading', () => {
    useScoreboardsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    useDoctorClinicalActivityMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Doctor report unavailable'),
    });

    render(<ScoreboardsTab {...dates} />);

    expect(screen.getByText('Failed to load doctor clinical activity: Doctor report unavailable')).toBeInTheDocument();
  });

  it('places doctor clinical activity immediately after Doctor Performance in normal scoreboard data', () => {
    useScoreboardsMock.mockReturnValue({
      data: {
        doctors: [{
          doctorId: 'doctor-a', doctorName: 'Dr A', uniquePatients: 1, totalRevenue: 100,
          totalCogs: 20, totalProfit: 80, revenuePerPatient: 100, marginPct: 80,
        }],
        topDiagnoses: [],
        topMedications: [],
        procedureRoi: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ScoreboardsTab {...dates} />);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Doctor Performance',
      'Doctor Clinical Activity',
      'Top 10 Diagnoses',
      'Top 10 Medications',
      'Procedure ROI',
    ]);
  });
});
