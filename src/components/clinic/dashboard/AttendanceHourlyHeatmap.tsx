import type { AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';
import { cn } from '@/lib/utils';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 16 }, (_, index) => index + 8);

function timeRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function cellStatus(cell: AttendanceHeatmapCell | undefined): 'closed' | 'uncovered' | 'insufficient' | 'covered' {
  if (!cell) return 'closed';
  if (cell.coverage === 'uncovered') return 'uncovered';
  if (cell.operatingOccurrences === 0) return 'closed';
  if (cell.coverage !== 'complete' || cell.averageVisits === null) return 'insufficient';
  return 'covered';
}

function statusText(status: ReturnType<typeof cellStatus>): string {
  if (status === 'closed') return 'Closed / not operating';
  if (status === 'uncovered') return 'Uncovered roster gap';
  return status === 'insufficient' ? 'Insufficient data' : 'Covered average';
}

function blueClass(cell: AttendanceHeatmapCell | undefined, maximum: number): string {
  if (cellStatus(cell) !== 'covered' || cell?.averageVisits === null) return 'bg-slate-100 text-slate-600';
  const ratio = maximum === 0 ? 0 : cell.averageVisits / maximum;
  if (ratio >= 0.75) return 'bg-blue-700 text-white';
  if (ratio >= 0.5) return 'bg-blue-500 text-white';
  if (ratio >= 0.25) return 'bg-blue-300 text-blue-950';
  return 'bg-blue-100 text-blue-950';
}

export function AttendanceHourlyHeatmap({ cells, onSelectCell }: { cells: AttendanceHeatmapCell[]; onSelectCell: (cell: AttendanceHeatmapCell) => void }) {
  const cellsBySlot = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const maximum = Math.max(0, ...cells.flatMap((cell) => cellStatus(cell) === 'covered' && cell.averageVisits !== null ? [cell.averageVisits] : []));

  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs" aria-label="Detailed heatmap legend"><span className="rounded bg-slate-100 px-2 py-1">Closed / not operating</span><span className="rounded bg-slate-200 px-2 py-1">Uncovered roster gap</span><span className="rounded bg-slate-300 px-2 py-1">Insufficient data</span><span className="rounded bg-blue-100 px-2 py-1 text-blue-950">Covered average (light to dark = lower to higher)</span><span className="rounded border-2 border-red-600 px-2 py-1 text-red-800">Wait alert (&gt;45 min)</span></div>
      <div className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Detailed attendance heatmap grid">
        <div className="grid min-w-[760px] grid-cols-[96px_repeat(7,minmax(88px,1fr))] gap-px rounded-md border bg-slate-200 p-px">
          <div className="bg-white p-2 text-xs font-semibold text-slate-600">Time</div>
          {weekdays.map((day) => <div key={day} className="bg-white p-2 text-center text-xs font-semibold text-slate-600">{day}</div>)}
          {hours.flatMap((hour) => [<div key={`${hour}-label`} className="bg-white p-2 text-xs font-medium text-slate-600">{timeRange(hour)}</div>, ...weekdays.map((day, dayIndex) => {
            const cell = cellsBySlot.get(`${dayIndex + 1}-${hour}`);
            const status = cellStatus(cell);
            const waitAlert = cell?.averageWaitMinutes !== null && cell?.averageWaitMinutes !== undefined && cell.averageWaitMinutes > 45;
            const average = cell?.averageVisits === null || cell?.averageVisits === undefined ? '—' : cell.averageVisits.toFixed(1);
            return <button key={`${day}-${hour}`} type="button" onClick={() => cell && onSelectCell(cell)} disabled={!cell} aria-label={`${day} ${timeRange(hour)}: ${average} average visits, ${statusText(status)}${waitAlert ? ', wait alert' : ''}`} className={cn('min-h-14 p-2 text-center text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-default', blueClass(cell, maximum), waitAlert && 'ring-2 ring-inset ring-red-600')}><span className="block font-semibold">{average}</span><span className="mt-1 block text-[10px] leading-tight">{statusText(status)}{waitAlert ? ' · Wait alert' : ''}</span></button>;
          })])}
        </div>
      </div>
    </>
  );
}
