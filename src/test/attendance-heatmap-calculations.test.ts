import { describe, expect, it } from 'vitest';
import {
  buildAttendanceRecommendations,
  normalizeAttendanceHeatmapReport,
  type AttendanceHeatmapCell,
} from '@/lib/clinic/attendanceHeatmap';

const period = {
  startDate: '2026-05-01',
  endDate: '2026-07-31',
  comparisonStartDate: '2026-01-29',
  comparisonEndDate: '2026-04-30',
  timezone: 'Asia/Kuala_Lumpur' as const,
};

function cell(overrides: Partial<AttendanceHeatmapCell> = {}): AttendanceHeatmapCell {
  return {
    weekday: 1,
    hour: 8,
    totalVisits: 16,
    operatingOccurrences: 8,
    averageVisits: 2,
    medianVisits: 2,
    peakVisits: 3,
    averageWaitMinutes: 10,
    waitMeasuredVisits: 8,
    comparisonAverageVisits: 1,
    comparisonAbsoluteChange: 1,
    comparisonPercentChange: 100,
    otherDoctorCoveredOccurrences: 0,
    dates: [],
    coverage: 'complete',
    ...overrides,
  };
}

describe('normalizeAttendanceHeatmapReport', () => {
  it('drops out-of-range cells and normalizes malformed metrics without inventing nullable values', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        {
          weekday: 1,
          hour: 8,
          totalVisits: '12',
          operatingOccurrences: '8',
          averageVisits: 'bad',
          medianVisits: 2,
          peakVisits: null,
          averageWaitMinutes: '25.5',
          waitMeasuredVisits: '4',
          comparisonAverageVisits: 4,
          otherDoctorCoveredOccurrences: '3',
          dates: [{ date: '2026-05-05', visits: '2', averageWaitMinutes: 'bad' }],
          coverage: 'complete',
        },
        { weekday: 0, hour: 8 },
        { weekday: 1, hour: 24 },
      ],
      doctors: 'not an array',
      warnings: [null, 'limited roster data'],
    });

    expect(result).toEqual({
      period,
      cells: [expect.objectContaining({
        weekday: 1,
        hour: 8,
        totalVisits: 12,
        operatingOccurrences: 8,
        averageVisits: null,
        medianVisits: 2,
        peakVisits: null,
        averageWaitMinutes: 25.5,
        waitMeasuredVisits: 4,
        comparisonAbsoluteChange: null,
        comparisonPercentChange: null,
        otherDoctorCoveredOccurrences: 3,
        dates: [{ date: '2026-05-05', visits: 2, averageWaitMinutes: null }],
        coverage: 'complete',
      })],
      doctors: [],
      warnings: ['limited roster data'],
    });
  });

  it('calculates comparison changes only when both comparable averages are valid', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 2, hour: 9, averageVisits: 3, comparisonAverageVisits: 2 },
        { weekday: 2, hour: 10, averageVisits: 3, comparisonAverageVisits: 0 },
      ],
    });

    expect(result.cells[0]).toMatchObject({ comparisonAbsoluteChange: 1, comparisonPercentChange: 50 });
    expect(result.cells[1]).toMatchObject({ comparisonAbsoluteChange: 3, comparisonPercentChange: null });
  });
});

describe('buildAttendanceRecommendations', () => {
  it('offers a two-hour quiet training window with sample and evidence', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ hour: 8, averageVisits: 1, medianVisits: 1, peakVisits: 1 }),
      cell({ hour: 9, averageVisits: 1, medianVisits: 1, peakVisits: 2 }),
      cell({ hour: 10, averageVisits: 8, medianVisits: 8, peakVisits: 9 }),
      cell({ weekday: 2, hour: 8, averageVisits: 6 }),
    ]);

    expect(recommendations.trainingWindows).toEqual([expect.objectContaining({
      weekday: 1,
      startHour: 8,
      endHour: 10,
      sampleSize: 16,
      evidence: expect.objectContaining({ averageVisits: 1, peakVisits: 2 }),
    })]);
  });

  it('suppresses quiet training windows that are unsafe or insufficiently sampled', () => {
    const unsafe = [
      cell({ hour: 8, averageVisits: 1, averageWaitMinutes: 46 }),
      cell({ hour: 9, averageVisits: 1 }),
    ];
    const insufficient = [
      cell({ hour: 8, operatingOccurrences: 7, coverage: 'complete', averageVisits: 1 }),
      cell({ hour: 9, operatingOccurrences: 7, coverage: 'complete', averageVisits: 1 }),
    ];

    expect(buildAttendanceRecommendations(unsafe).trainingWindows).toEqual([]);
    expect(buildAttendanceRecommendations(insufficient).trainingWindows).toEqual([]);
  });

  it('flags a selected doctor’s possible off-day only when other-doctor coverage exists', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ averageVisits: 0, medianVisits: 0, peakVisits: 0, otherDoctorCoveredOccurrences: 8 }),
    ], 'doctor-1');

    expect(recommendations.possibleDoctorOffDays).toEqual([expect.objectContaining({
      weekday: 1,
      hour: 8,
      sampleSize: 8,
      evidence: expect.objectContaining({ otherDoctorCoveredOccurrences: 8 }),
    })]);
    expect(buildAttendanceRecommendations([cell({ averageVisits: 0, medianVisits: 0, peakVisits: 0 })], 'doctor-1').possibleDoctorOffDays).toEqual([]);
  });

  it('identifies busiest periods and unusually high waits for staffing review', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ hour: 8, averageVisits: 1 }),
      cell({ hour: 9, averageVisits: 2 }),
      cell({ hour: 10, averageVisits: 3 }),
      cell({ hour: 11, averageVisits: 4, averageWaitMinutes: 46 }),
    ]);

    expect(recommendations.peakStaffing).toEqual(expect.arrayContaining([
      expect.objectContaining({ weekday: 1, hour: 11, sampleSize: 8, evidence: expect.objectContaining({ averageWaitMinutes: 46 }) }),
    ]));
  });

  it('flags unstable peaks materially above typical volume', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ medianVisits: 2, averageVisits: 2, peakVisits: 6 }),
    ]);

    expect(recommendations.unstablePeaks).toEqual([expect.objectContaining({
      sampleSize: 8,
      evidence: expect.objectContaining({ medianVisits: 2, averageVisits: 2, peakVisits: 6 }),
    })]);
  });
});
