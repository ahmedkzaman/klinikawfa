/**
 * Roster-aware shift lookup & Akta Buruh 1955 compliant work-hour helpers.
 *
 * Shift definitions (from roster generator):
 *   Doctor: S1 08:00-14:00, S2 14:00-20:00, S3 20:00-00:00
 *   Support: S1 08:00-14:00, S2 14:00-20:00
 */

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// ---------- Shift time map ----------

const SHIFT_TIMES: Record<string, { start: string; end: string; label: string }> = {
  S1: { start: '08:00', end: '16:00', label: 'Shift 1 (8am – 4pm)' },
  S2: { start: '16:00', end: '23:59', label: 'Shift 2 (4pm – 12am)' },
  S3: { start: '20:00', end: '23:59', label: 'Shift 3 (8pm – 12am)' },
  // Combined (doctor daytime = S1+S2)
  Daytime: { start: '08:00', end: '23:59', label: 'Daytime (8am – 12am)' },
  // Hybrid shift (purchaser / housecall nurse) — AM only
  Hybrid: { start: '08:00', end: '13:00', label: 'Hybrid (8am – 1pm)' },
  // Resident-doctor / clinical shifts
  DOC_S1: { start: '08:00', end: '13:00', label: 'Doctor S1 (8am – 1pm)' },
  DOC_S2: { start: '14:00', end: '19:00', label: 'Doctor S2 (2pm – 7pm)' },
  DOC_S3: { start: '20:00', end: '23:59', label: 'Doctor S3 (8pm – 12am)' },
};

/**
 * Normalize roster shift keys (e.g. "shift1", "S1", "daytime", "night") into
 * canonical keys used by SHIFT_TIMES (S1, S2, S3, Daytime, Hybrid).
 */
export function normalizeShiftKey(raw: string): string {
  if (!raw) return raw;
  // Preserve canonical doctor-shift keys without lowercasing
  if (raw === 'DOC_S1' || raw === 'DOC_S2' || raw === 'DOC_S3') return raw;
  const k = raw.toLowerCase().trim();
  switch (k) {
    case 's1': case 'shift1': return 'S1';
    case 's2': case 'shift2': return 'S2';
    case 's3': case 'shift3': case 'night': return 'S3';
    case 'daytime': return 'Daytime';
    case 'hybrid': return 'Hybrid';
    case 'doc_s1': return 'DOC_S1';
    case 'doc_s2': return 'DOC_S2';
    case 'doc_s3': return 'DOC_S3';
    default: return raw;
  }
}

export type ShiftInfo = {
  shiftKey: string;
  start: string;   // HH:mm
  end: string;      // HH:mm
  label: string;
};

/**
 * Look up a user's assigned shift for a given date from saved_rosters.
 * Returns null if no roster found.
 */
export async function getUserShiftForDate(
  userId: string,
  date: Date,
): Promise<ShiftInfo | null> {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const dayOfMonth = date.getDate();

  // Fetch both roster types (doctor + support)
  const { data: rosters } = await supabase
    .from('saved_rosters')
    .select('roster_data, staff_list, roster_type')
    .eq('month', month)
    .eq('year', year);

  if (!rosters || rosters.length === 0) return null;

  const targetDateStr = format(date, 'yyyy-MM-dd');
  const paddedDay = String(dayOfMonth).padStart(2, '0');
  const unpaddedDay = String(dayOfMonth);

  for (const roster of rosters) {
    const staffList = roster.staff_list as any[];
    const isInRoster = staffList?.some((s: any) => s.staffId === userId);
    if (!isInRoster) continue;

    const rosterData = roster.roster_data as Record<string, any>;

    // Find the matching day key — supports yyyy-MM-dd or padded/unpadded day-of-month
    let dayData: any = null;
    for (const [k, v] of Object.entries(rosterData)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        if (k === targetDateStr) { dayData = v; break; }
      } else if (k === paddedDay || k === unpaddedDay) {
        dayData = v; break;
      }
    }
    if (!dayData) continue;

    // Check each shift key (S1, S2, S3, Daytime, Night, etc.)
    for (const [rawShiftKey, cellData] of Object.entries(dayData)) {
      if (!cellData) continue;
      const cells = Array.isArray(cellData) ? cellData : [cellData];
      const found = cells.find((c: any) => c.staffId === userId);
      if (found) {
        const shiftKey = normalizeShiftKey(rawShiftKey);
        const shiftDef = SHIFT_TIMES[shiftKey];
        if (shiftDef) return { shiftKey, ...shiftDef };
        // Fallback
        return { shiftKey, start: '08:00', end: '20:00', label: shiftKey };
      }
    }
  }

  return null;
}

/**
 * Batch-fetch shift starts for a user across a whole month.
 * Returns a map: 'yyyy-MM-dd' -> ShiftInfo
 */
export async function getUserShiftsForMonth(
  userId: string,
  month: number, // 0-indexed
  year: number,
): Promise<Record<string, ShiftInfo>> {
  const { data: rosters } = await supabase
    .from('saved_rosters')
    .select('roster_data, staff_list, roster_type')
    .eq('month', month + 1) // DB stores 1-indexed
    .eq('year', year);

  const result: Record<string, ShiftInfo> = {};
  if (!rosters || rosters.length === 0) return result;

  for (const roster of rosters) {
    const staffList = roster.staff_list as any[];
    if (!staffList?.some((s: any) => s.staffId === userId)) continue;

    const rosterData = roster.roster_data as Record<string, any>;
    for (const [dayKey, dayData] of Object.entries(rosterData)) {
      if (!dayData || typeof dayData !== 'object') continue;
      for (const [rawShiftKey, cellData] of Object.entries(dayData as Record<string, any>)) {
        if (!cellData) continue;
        const cells = Array.isArray(cellData) ? cellData : [cellData];
        const found = cells.find((c: any) => c.staffId === userId);
        if (found) {
          const shiftKey = normalizeShiftKey(rawShiftKey);
          const shiftDef = SHIFT_TIMES[shiftKey] || SHIFT_TIMES.S1;
          const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
            ? dayKey
            : `${year}-${String(month + 1).padStart(2, '0')}-${dayKey.padStart(2, '0')}`;
          result[dateStr] = { shiftKey, ...shiftDef };
        }
      }
    }
  }

  return result;
}

/**
 * Batch-fetch shifts for ALL users in a month (admin view).
 * Returns map: userId -> { 'yyyy-MM-dd' -> ShiftInfo }
 */
export async function getAllShiftsForMonth(
  month: number, // 0-indexed
  year: number,
): Promise<Record<string, Record<string, ShiftInfo>>> {
  const { data: rosters } = await supabase
    .from('saved_rosters')
    .select('roster_data, staff_list, roster_type')
    .eq('month', month + 1)
    .eq('year', year);

  const result: Record<string, Record<string, ShiftInfo>> = {};
  if (!rosters || rosters.length === 0) return result;

  for (const roster of rosters) {
    const rosterData = roster.roster_data as Record<string, any>;
    for (const [dayKey, dayData] of Object.entries(rosterData)) {
      if (!dayData || typeof dayData !== 'object') continue;
      for (const [rawShiftKey, cellData] of Object.entries(dayData as Record<string, any>)) {
        if (!cellData) continue;
        const cells = Array.isArray(cellData) ? cellData : [cellData];
        for (const cell of cells) {
          if (!cell?.staffId) continue;
          const userId = cell.staffId;
          if (!result[userId]) result[userId] = {};
          const shiftKey = normalizeShiftKey(rawShiftKey);
          const shiftDef = SHIFT_TIMES[shiftKey] || SHIFT_TIMES.S1;
          const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
            ? dayKey
            : `${year}-${String(month + 1).padStart(2, '0')}-${dayKey.padStart(2, '0')}`;
          result[userId][dateStr] = { shiftKey, ...shiftDef };
        }
      }
    }
  }

  return result;
}

// ---------- Lateness helpers ----------

export type LatenessSeverity = 'on_time' | 'minor_late' | 'late';

/**
 * Calculate lateness severity based on minutes late.
 * - on_time: 0 min or early
 * - minor_late: 1–14 min
 * - late: ≥15 min
 */
export function getLatenessSeverity(lateMinutes: number): LatenessSeverity {
  if (lateMinutes <= 0) return 'on_time';
  if (lateMinutes < 15) return 'minor_late';
  return 'late';
}

/**
 * Get the CSS classes for a lateness severity badge.
 */
export function getLatenessColorClasses(severity: LatenessSeverity): string {
  switch (severity) {
    case 'on_time':
      return 'bg-green-100 text-green-700';
    case 'minor_late':
      return 'bg-yellow-100 text-yellow-700';
    case 'late':
      return 'bg-red-100 text-red-700';
  }
}

/**
 * Get the dot color class for attendance history.
 */
export function getLatenessDotColor(severity: LatenessSeverity): string {
  switch (severity) {
    case 'on_time':
      return 'bg-green-500';
    case 'minor_late':
      return 'bg-yellow-500';
    case 'late':
      return 'bg-red-500';
  }
}

// ---------- Akta Buruh 1955 Work Hours ----------

export type DailyWorkHours = {
  /** Total raw minutes from clock-in to clock-out */
  rawMinutes: number;
  /** Mandatory break deducted (minutes) */
  breakMinutes: number;
  /** Net worked minutes after break deduction */
  netMinutes: number;
  /** Normal hours (max 8h = 480 min per day) */
  normalMinutes: number;
  /** Overtime minutes (anything beyond 8h/day after break) */
  overtimeMinutes: number;
};

/**
 * Calculate daily work hours compliant with Akta Buruh 1955.
 *
 * Rules:
 * - If worked > 5 consecutive hours, mandatory 30-min break
 * - If worked > 8 hours, 60-min break total (additional 30-min)
 * - Normal hours capped at 8h (480 min) per day
 * - Overtime = net hours beyond 8h
 */
export function calculateDailyWorkHours(clockIn: Date, clockOut: Date): DailyWorkHours {
  const rawMinutes = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / 60000);

  // Mandatory break deduction per Akta Buruh 1955
  let breakMinutes = 0;
  if (rawMinutes > 480) {
    // More than 8 hours: 60 min break
    breakMinutes = 60;
  } else if (rawMinutes > 300) {
    // More than 5 hours: 30 min break
    breakMinutes = 30;
  }

  const netMinutes = Math.max(0, rawMinutes - breakMinutes);
  const normalMinutes = Math.min(480, netMinutes); // Max 8h normal
  const overtimeMinutes = Math.max(0, netMinutes - 480);

  return { rawMinutes, breakMinutes, netMinutes, normalMinutes, overtimeMinutes };
}

/**
 * Format DailyWorkHours for display.
 * E.g. "7h 30m (30m break)" or "8h 0m + 1h 30m OT (60m break)"
 */
export function formatWorkHours(wh: DailyWorkHours): string {
  const normalH = Math.floor(wh.normalMinutes / 60);
  const normalM = Math.round(wh.normalMinutes % 60);
  let str = `${normalH}h ${normalM}m`;

  if (wh.overtimeMinutes > 0) {
    const otH = Math.floor(wh.overtimeMinutes / 60);
    const otM = Math.round(wh.overtimeMinutes % 60);
    str += ` + ${otH}h ${otM}m OT`;
  }

  if (wh.breakMinutes > 0) {
    str += ` (${wh.breakMinutes}m break)`;
  }

  return str;
}

/**
 * Calculate lateness in minutes given actual clock-in and scheduled start time.
 */
export function calculateLatenessMinutes(clockIn: Date, scheduledStart: string, day: Date): number {
  const [sh, sm] = scheduledStart.split(':').map(Number);
  const shiftDate = new Date(day);
  shiftDate.setHours(sh, sm, 0, 0);
  return Math.round((clockIn.getTime() - shiftDate.getTime()) / 60000);
}

/** Default shift start fallback when no roster found */
export const DEFAULT_SHIFT_START = '09:00';
export const DEFAULT_SHIFT_INFO: ShiftInfo = {
  shiftKey: 'default',
  start: '09:00',
  end: '17:00',
  label: 'Default (9am – 5pm)',
};
