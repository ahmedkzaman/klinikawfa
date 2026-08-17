import type { AttendanceHourlyForecast } from '@/lib/clinic/attendanceRegression';

export function averageShiftExpectedVisits(forecast: Array<Pick<AttendanceHourlyForecast, 'weekday' | 'hour' | 'expectedVisits'>>): number | null {
  const weekdayCount = new Set(forecast.map(item => item.weekday)).size;
  return weekdayCount === 0 ? null : forecast.reduce((sum, item) => sum + item.expectedVisits, 0) / weekdayCount;
}
