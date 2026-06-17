import { format } from 'date-fns';

/**
 * Formats a daily-resetting queue number as `YYMMDD-NN`
 * (e.g. `260510-01`). The date prefix preserves chronology
 * across midnight carry-overs and printed slips.
 */
export const formatQueueNo = (
  createdAt: string | Date | null | undefined,
  seq: number | null | undefined,
): string => {
  if (seq == null || createdAt == null) return '—';
  try {
    const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    if (Number.isNaN(d.getTime())) return '—';
    return `${format(d, 'yyMMdd')}-${String(seq).padStart(2, '0')}`;
  } catch {
    return '—';
  }
};
