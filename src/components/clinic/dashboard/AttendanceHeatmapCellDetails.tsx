import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function timeRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function amount(value: number | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value}${suffix}`;
}

export function AttendanceHeatmapCellDetails({
  cell,
  open,
  onOpenChange,
}: {
  cell: AttendanceHeatmapCell | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!cell) return null;
  const comparison = cell.comparisonAbsoluteChange === null
    ? 'Unavailable'
    : `${cell.comparisonAbsoluteChange >= 0 ? '+' : ''}${cell.comparisonAbsoluteChange} visits (${cell.comparisonPercentChange === null ? 'percentage unavailable' : `${cell.comparisonPercentChange >= 0 ? '+' : ''}${cell.comparisonPercentChange}%`})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="attendance-cell-detail-description" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Attendance cell details</DialogTitle>
          <DialogDescription id="attendance-cell-detail-description">
            {weekdays[cell.weekday - 1]} {timeRange(cell.hour)}. Aggregate operational data only.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Total visits: <strong>{cell.totalVisits}</strong></p>
          <p>Average: <strong>{amount(cell.averageVisits)}</strong></p>
          <p>Median: <strong>{amount(cell.medianVisits)}</strong></p>
          <p>Peak: <strong>{amount(cell.peakVisits)}</strong></p>
          <p>Operating-date sample: <strong>{cell.operatingOccurrences}</strong></p>
          <p>Average wait: <strong>{amount(cell.averageWaitMinutes, ' min')}</strong></p>
          <p>Measured waits: <strong>{cell.waitMeasuredVisits}</strong></p>
          <p>Comparison: <strong>{comparison}</strong></p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Operating date summaries</h3>
          {cell.dates.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">No operating-date summaries are available.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {cell.dates.map((date) => (
                <li key={date.date}>{date.date}: {date.visits} visit{date.visits === 1 ? '' : 's'}{date.averageWaitMinutes === null ? '' : `, ${date.averageWaitMinutes} min average wait`}</li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
