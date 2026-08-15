import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeAttendanceHeatmapReport,
  type AttendanceHeatmapReport,
} from '@/lib/clinic/attendanceHeatmap';

export type AttendancePeriodPreset = 'latest_12_weeks' | 'month' | 'quarter' | 'custom';

export type AttendanceRangeInput = {
  preset: AttendancePeriodPreset;
  now?: Date;
  startDate?: string;
  endDate?: string;
};

type AttendanceHeatmapInput = {
  startDate: string;
  endDate: string;
  doctorId: string | null;
};

type DateParts = { year: number; month: number; day: number };

const malaysiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateString(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function malaysiaDateParts(now: Date): DateParts {
  const values = malaysiaDateFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): number => Number(
    values.find(part => part.type === type)?.value,
  );
  return { year: value('year'), month: value('month'), day: value('day') };
}

function utcDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date ? null : value;
}

function dateAfter(date: string, days: number): string {
  const value = utcDate(date);
  if (!value) throw new RangeError('Invalid date range');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function rangeIsValid(startDate: string, endDate: string): boolean {
  const start = utcDate(startDate);
  const end = utcDate(endDate);
  return start !== null && end !== null
    && start <= end
    && (end.getTime() - start.getTime()) / 86_400_000 <= 365;
}

function assertRange(startDate: string | undefined, endDate: string | undefined): void {
  if (!startDate || !endDate || !rangeIsValid(startDate, endDate)) {
    throw new RangeError('Invalid date range');
  }
}

export function malaysiaToday(now: Date = new Date()): string {
  return dateString(malaysiaDateParts(now));
}

export function attendancePresetRange(input: AttendanceRangeInput): { startDate: string; endDate: string } {
  const today = malaysiaToday(input.now);

  if (input.preset === 'latest_12_weeks') {
    return { startDate: dateAfter(today, -83), endDate: today };
  }

  if (input.preset === 'custom') {
    assertRange(input.startDate, input.endDate);
    return { startDate: input.startDate, endDate: input.endDate };
  }

  const { year, month } = malaysiaDateParts(input.now ?? new Date());
  if (input.preset === 'month') {
    const endDate = new Date(Date.UTC(year, month, 0));
    return {
      startDate: dateString({ year, month, day: 1 }),
      endDate: dateString({ year, month, day: endDate.getUTCDate() }),
    };
  }

  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const quarterEnd = new Date(Date.UTC(year, quarterStartMonth + 2, 0));
  return {
    startDate: dateString({ year, month: quarterStartMonth, day: 1 }),
    endDate: dateString({
      year: quarterEnd.getUTCFullYear(),
      month: quarterEnd.getUTCMonth() + 1,
      day: quarterEnd.getUTCDate(),
    }),
  };
}

// Generated Supabase types are refreshed separately from this additive RPC.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useAttendanceHeatmap(input: AttendanceHeatmapInput): UseQueryResult<AttendanceHeatmapReport, Error> {
  const enabled = rangeIsValid(input.startDate, input.endDate);

  return useQuery<AttendanceHeatmapReport, Error>({
    queryKey: ['clinical-attendance-heatmap', input.startDate, input.endDate, input.doctorId ?? 'all'],
    enabled,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_clinical_attendance_heatmap', {
        _start_date: input.startDate,
        _end_date: input.endDate,
        _doctor_id: input.doctorId,
      });
      if (error) throw error;
      return normalizeAttendanceHeatmapReport(data);
    },
  });
}
