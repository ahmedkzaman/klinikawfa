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
    rawTotalVisits: 16,
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
  it('normalizes aggregate attendance model observations', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [],
      observations: [{
        date: '2026-08-03',
        weekday: 1,
        hour: 8,
        visits: 4,
        averageWaitMinutes: 18.5,
        waitMeasuredVisits: 4,
        doctorsRostered: 2,
        selectedDoctorScheduled: true,
        backupDoctorCovered: true,
      }],
    });

    expect(result.observations).toEqual([{
      date: '2026-08-03', weekday: 1, hour: 8, visits: 4,
      averageWaitMinutes: 18.5, waitMeasuredVisits: 4,
      doctorsRostered: 2, selectedDoctorScheduled: true, backupDoctorCovered: true,
    }]);
  });

  it('discards malformed model observations without discarding descriptive cells', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [{ weekday: 1, hour: 8, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: 2, otherDoctorCoveredOccurrences: 0 }],
      observations: [
        { date: '2026-02-30', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 24, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 8, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: -1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: -1, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: -1, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 0, selectedDoctorScheduled: false, backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: 'false', backupDoctorCovered: false },
        { date: '2026-08-03', weekday: 1, hour: 8, visits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0, doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: 'false' },
      ],
    });

    expect(result.cells).toHaveLength(1);
    expect(result.observations).toEqual([]);
    expect(result.warnings).toContain('Malformed attendance model observations were discarded.');
  });

  it('caps model observations and warns when the payload exceeds 52 weeks of roster slots', () => {
    const observation = {
      date: '2026-08-03', weekday: 1, hour: 8, visits: 1,
      averageWaitMinutes: null, waitMeasuredVisits: 0,
      doctorsRostered: 1, selectedDoctorScheduled: false, backupDoctorCovered: false,
    };
    const result = normalizeAttendanceHeatmapReport({
      period,
      observations: Array.from({ length: 5_825 }, () => observation),
    });

    expect(result.observations).toHaveLength(5_824);
    expect(result.warnings).toContain('Attendance model observations were truncated.');
  });

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
        rawTotalVisits: 12,
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
      hasAttendanceData: true,
      observations: [],
      warnings: ['limited roster data'],
    });
  });

  it('calculates comparison changes only when both comparable averages are valid', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 2, hour: 9, totalVisits: 24, operatingOccurrences: 8, waitMeasuredVisits: 8, otherDoctorCoveredOccurrences: 0, averageVisits: 3, comparisonAverageVisits: 2 },
        { weekday: 2, hour: 10, totalVisits: 24, operatingOccurrences: 8, waitMeasuredVisits: 8, otherDoctorCoveredOccurrences: 0, averageVisits: 3, comparisonAverageVisits: 0 },
      ],
    });

    expect(result.cells[0]).toMatchObject({ comparisonAbsoluteChange: 1, comparisonPercentChange: 50 });
    expect(result.cells[1]).toMatchObject({ comparisonAbsoluteChange: 3, comparisonPercentChange: null });
  });

  it('preserves uncovered roster gaps and marks an all-uncovered response as having no attendance data', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 1, hour: 8, totalVisits: 0, operatingOccurrences: 0, waitMeasuredVisits: 0, otherDoctorCoveredOccurrences: 0, coverage: 'uncovered' },
        { weekday: 1, hour: 9, totalVisits: 0, operatingOccurrences: 0, waitMeasuredVisits: 0, otherDoctorCoveredOccurrences: 0, coverage: 'uncovered' },
      ],
    });

    expect(result.cells.every((item) => item.coverage === 'uncovered')).toBe(true);
    expect(result.hasAttendanceData).toBe(false);
  });

  it('rejects cells with missing, malformed, or negative required aggregate counts', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [
        { weekday: 1, hour: 8, operatingOccurrences: 8, waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 9, totalVisits: 2, operatingOccurrences: 'eight', waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 10, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: -1, otherDoctorCoveredOccurrences: 0 },
        { weekday: 1, hour: 11, totalVisits: 2, operatingOccurrences: 8, waitMeasuredVisits: 4, otherDoctorCoveredOccurrences: null },
      ],
    });

    expect(result.cells).toEqual([]);
  });

  it('rejects malformed date summaries instead of reporting zero visits', () => {
    const result = normalizeAttendanceHeatmapReport({
      period,
      cells: [{
        weekday: 1,
        hour: 8,
        totalVisits: 2,
        operatingOccurrences: 8,
        waitMeasuredVisits: 2,
        otherDoctorCoveredOccurrences: 0,
        dates: [
          { date: '2026-05-05', visits: 'bad' },
          { date: '2026-05-06', visits: -1 },
          { date: '2026-05-07', visits: 2 },
        ],
      }],
    });

    expect(result.cells[0]?.dates).toEqual([{ date: '2026-05-07', visits: 2, averageWaitMinutes: null }]);
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

  it('recommends the lowest-attendance weekday for all doctors at weekday level', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, totalVisits: 16, averageVisits: 2, peakVisits: 3 }),
      cell({ weekday: 1, hour: 9, totalVisits: 24, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 2, hour: 8, totalVisits: 8, averageVisits: 1, peakVisits: 2 }),
      cell({ weekday: 2, hour: 9, totalVisits: 8, averageVisits: 1, peakVisits: 2 }),
      cell({ weekday: 3, hour: 8, totalVisits: 40, averageVisits: 5, peakVisits: 6 }),
      cell({ weekday: 3, hour: 9, totalVisits: 40, averageVisits: 5, peakVisits: 6 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).toEqual([expect.objectContaining({
      weekday: 2,
      sampleSize: 8,
      evidence: expect.objectContaining({ averageVisits: 2, peakVisits: 2 }),
    })]);
    expect(recommendations.possibleDoctorOffDays[0]).not.toHaveProperty('hour');
  });

  it('suppresses the lowest weekday when its peak hour is in the busiest quartile', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, averageVisits: 0.5, peakVisits: 1 }),
      cell({ weekday: 1, hour: 9, averageVisits: 4, peakVisits: 5 }),
      cell({ weekday: 2, hour: 8, averageVisits: 2, peakVisits: 3 }),
      cell({ weekday: 2, hour: 9, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 3, hour: 8, averageVisits: 3, peakVisits: 4 }),
      cell({ weekday: 3, hour: 9, averageVisits: 3, peakVisits: 4 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).toEqual([]);
  });

  it('requires selected-doctor support on every comparable operating date', () => {
    const supported = [
      cell({ weekday: 2, hour: 8, averageVisits: 1, peakVisits: 2, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 2, hour: 9, averageVisits: 1, peakVisits: 2, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 3, hour: 8, averageVisits: 4, peakVisits: 5, otherDoctorCoveredOccurrences: 8 }),
      cell({ weekday: 3, hour: 9, averageVisits: 4, peakVisits: 5, otherDoctorCoveredOccurrences: 8 }),
    ];

    expect(buildAttendanceRecommendations(supported, 'doctor-1').possibleDoctorOffDays).toEqual([
      expect.objectContaining({
        weekday: 2,
        sampleSize: 8,
        evidence: expect.objectContaining({ otherDoctorCoveredOccurrences: 8 }),
      }),
    ]);
    expect(buildAttendanceRecommendations([
      supported[0],
      cell({ ...supported[1], otherDoctorCoveredOccurrences: 7 }),
      supported[2],
      supported[3],
    ], 'doctor-1').possibleDoctorOffDays).toEqual([]);
  });

  it('does not infer an off-day from only the complete part of an incompletely covered weekday', () => {
    const recommendations = buildAttendanceRecommendations([
      cell({ weekday: 1, hour: 8, averageVisits: 1 }),
      cell({ weekday: 1, hour: 9, operatingOccurrences: 7, coverage: 'insufficient', averageVisits: 0 }),
      cell({ weekday: 2, hour: 8, averageVisits: 3 }),
      cell({ weekday: 2, hour: 9, averageVisits: 3 }),
      cell({ weekday: 3, hour: 8, averageVisits: 5 }),
      cell({ weekday: 3, hour: 9, averageVisits: 5 }),
    ]);

    expect(recommendations.possibleDoctorOffDays).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ weekday: 1 }),
    ]));
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
