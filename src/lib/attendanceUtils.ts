/**
 * Returns the logical work date string ('yyyy-MM-dd') for an attendance row.
 * Prefers the explicit `logical_work_date` (hard-linked at punch time), falls
 * back to the local-date portion of `punch_time` for legacy rows.
 */
export function logicalWorkDateOf(record: { logical_work_date?: string | null; punch_time: string }): string {
  if (record.logical_work_date) return record.logical_work_date;
  // Local-time date (browser TZ ≈ Asia/Kuala_Lumpur for users in Malaysia)
  const d = new Date(record.punch_time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
