import { describe, expect, it } from 'vitest';
import {
  MANAGEMENT_METRIC_DEFINITIONS,
  calculateAchievement,
  getCoverageLabel,
  normalizeDashboardReport,
} from './managementDashboard';

describe('management dashboard domain contract', () => {
  it('preserves unavailable values instead of converting them to zero', () => {
    const result = normalizeDashboardReport({
      operations: { totalPax: 7, averageWaitMinutes: null, waitMeasuredVisits: 0, daily: [] },
    });
    expect(result.operations.totalPax).toBe(7);
    expect(result.operations.averageWaitMinutes).toBeNull();
    expect(result.operations.waitMeasuredVisits).toBe(0);
  });

  it('calculates achievement only for a positive target', () => {
    expect(calculateAchievement(64_000, 80_000)).toBe(80);
    expect(calculateAchievement(64_000, 0)).toBeNull();
    expect(calculateAchievement(64_000, null)).toBeNull();
  });

  it('uses explicit confidence language and typed manual definitions', () => {
    expect(getCoverageLabel('insufficient', 0)).toBe('Insufficient tracked data');
    expect(MANAGEMENT_METRIC_DEFINITIONS.gross_revenue_target.kind).toBe('currency');
    expect(MANAGEMENT_METRIC_DEFINITIONS.google_rating.max).toBe(5);
    expect(MANAGEMENT_METRIC_DEFINITIONS.clinic_manager_meeting.group).toBe('governance');
  });
});
