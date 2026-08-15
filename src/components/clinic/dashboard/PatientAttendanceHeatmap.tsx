import { useMemo, useState } from 'react';
import { AttendanceHeatmapCellDetails } from '@/components/clinic/dashboard/AttendanceHeatmapCellDetails';
import { AttendanceRecommendations } from '@/components/clinic/dashboard/AttendanceRecommendations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { attendancePresetRange, type AttendancePeriodPreset, useAttendanceHeatmap } from '@/hooks/clinic/useAttendanceHeatmap';
import { assessDoctorOffDays, type AttendanceHeatmapCell, type DoctorOffDayAssessment } from '@/lib/clinic/attendanceHeatmap';
import { fitAttendanceRegression, type AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';
import { cn } from '@/lib/utils';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 16 }, (_, index) => index + 8);
const emptyCells: AttendanceHeatmapCell[] = [];

function unavailableRegression(reason: string, observationCount: number): AttendanceRegressionResult {
  return {
    status: 'unavailable',
    diagnostics: {
      family: 'negative_binomial',
      converged: false,
      iterations: 0,
      usableWeeks: 0,
      observationCount,
      dispersion: Number.NaN,
      warnings: [reason],
    },
    reasons: [reason],
  };
}

function unavailableAssessments(reason: string): DoctorOffDayAssessment[] {
  return [{
    status: 'unavailable',
    weekday: null,
    forecast: null,
    safetyScore: null,
    reasons: [reason],
    passedChecks: [],
  }];
}

function timeRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function dateRangeIsValid(startDate: string, endDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    && startDate <= endDate
    && (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) <= 364 * 86_400_000;
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

export function PatientAttendanceHeatmap() {
  const initialRange = useMemo(() => attendancePresetRange({ preset: 'latest_12_weeks' }), []);
  const [preset, setPreset] = useState<AttendancePeriodPreset>('latest_12_weeks');
  const [customStartDate, setCustomStartDate] = useState(initialRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<AttendanceHeatmapCell | null>(null);
  const range = preset === 'custom'
    ? { startDate: customStartDate, endDate: customEndDate }
    : attendancePresetRange({ preset });
  const invalidRange = !dateRangeIsValid(range.startDate, range.endDate);
  const query = useAttendanceHeatmap({ startDate: range.startDate, endDate: range.endDate, doctorId });
  const report = query.data;
  const cells = report?.cells ?? emptyCells;
  const hasAttendanceData = report?.hasAttendanceData ?? cells.length > 0;
  const regression = useMemo(() => {
    try {
      return fitAttendanceRegression(query.data?.observations ?? [], doctorId);
    } catch {
      return unavailableRegression('Attendance regression is unavailable. Descriptive heatmap remains available.', query.data?.observations.length ?? 0);
    }
  }, [query.data?.observations, doctorId]);
  const offDayAssessments = useMemo(() => {
    try {
      return assessDoctorOffDays(cells, regression, doctorId);
    } catch {
      return unavailableAssessments('Off-day safety assessment is unavailable. Descriptive heatmap remains available.');
    }
  }, [cells, regression, doctorId]);
  const cellsBySlot = useMemo(() => new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell])), [cells]);
  const maximum = Math.max(0, ...cells.flatMap((cell) => cellStatus(cell) === 'covered' && cell.averageVisits !== null ? [cell.averageVisits] : []));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Patient attendance heatmap</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Average visits per operating date, Malaysia time (08:00–00:00).</p>
          </div>
          <Badge variant="outline">Aggregate data only</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label htmlFor="attendance-period">Attendance period</Label><select id="attendance-period" aria-label="Attendance period" value={preset} onChange={(event) => setPreset(event.target.value as AttendancePeriodPreset)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="latest_12_weeks">Latest 12 weeks</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="custom">Custom range</option></select></div>
            <div className="space-y-1"><Label htmlFor="treating-doctor">Treating doctor</Label><select id="treating-doctor" aria-label="Treating doctor" value={doctorId ?? 'all'} onChange={(event) => setDoctorId(event.target.value === 'all' ? null : event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="all">All doctors</option>{report?.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select><p className="text-xs text-slate-500">{doctorId ? 'Selected treating doctor' : 'All doctors'}</p></div>
            {preset === 'custom' && <><div className="space-y-1"><Label htmlFor="custom-start-date">Custom start date</Label><Input id="custom-start-date" aria-label="Custom start date" type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="custom-end-date">Custom end date</Label><Input id="custom-end-date" aria-label="Custom end date" type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} /></div></>}
          </div>
          {invalidRange && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Invalid date range. Choose at most 365 inclusive dates.</p>}
          {report?.warnings.map((warning) => <p key={warning} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
          {query.isLoading && <p className="text-sm text-slate-500">Loading attendance heatmap…</p>}
          {query.isError && <p role="alert" className="text-sm text-red-700">{query.error?.message ?? 'Attendance heatmap is unavailable.'}</p>}
          {!invalidRange && !query.isLoading && !query.isError && !hasAttendanceData && <p className="text-sm text-slate-500">No attendance data or roster coverage is available for this range.</p>}
          {!invalidRange && !query.isLoading && !query.isError && hasAttendanceData && <>
            <div className="flex flex-wrap gap-2 text-xs" aria-label="Heatmap legend"><span className="rounded bg-slate-100 px-2 py-1">Closed / not operating</span><span className="rounded bg-slate-200 px-2 py-1">Uncovered roster gap</span><span className="rounded bg-slate-300 px-2 py-1">Insufficient data</span><span className="rounded bg-blue-100 px-2 py-1 text-blue-950">Covered average (light to dark = lower to higher)</span><span className="rounded border-2 border-red-600 px-2 py-1 text-red-800">Wait alert (&gt;45 min)</span></div>
            <div className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Attendance heatmap grid">
              <div className="grid min-w-[760px] grid-cols-[96px_repeat(7,minmax(88px,1fr))] gap-px rounded-md border bg-slate-200 p-px">
                <div className="bg-white p-2 text-xs font-semibold text-slate-600">Time</div>
                {weekdays.map((day) => <div key={day} className="bg-white p-2 text-center text-xs font-semibold text-slate-600">{day}</div>)}
                {hours.flatMap((hour) => [<div key={`${hour}-label`} className="bg-white p-2 text-xs font-medium text-slate-600">{timeRange(hour)}</div>, ...weekdays.map((day, dayIndex) => {
                  const cell = cellsBySlot.get(`${dayIndex + 1}-${hour}`);
                  const status = cellStatus(cell);
                  const waitAlert = cell?.averageWaitMinutes !== null && cell?.averageWaitMinutes !== undefined && cell.averageWaitMinutes > 45;
                  const average = cell?.averageVisits === null || cell?.averageVisits === undefined ? '—' : cell.averageVisits.toFixed(1);
                  return <button key={`${day}-${hour}`} type="button" onClick={() => cell && setSelectedCell(cell)} disabled={!cell} aria-label={`${day} ${timeRange(hour)}: ${average} average visits, ${statusText(status)}${waitAlert ? ', wait alert' : ''}`} className={cn('min-h-14 p-2 text-center text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-default', blueClass(cell, maximum), waitAlert && 'ring-2 ring-inset ring-red-600')}><span className="block font-semibold">{average}</span><span className="mt-1 block text-[10px] leading-tight">{statusText(status)}{waitAlert ? ' · Wait alert' : ''}</span></button>;
                })])}
              </div>
            </div>
          </>}
        </CardContent>
      </Card>
      {!query.isLoading && !query.isError && !invalidRange && hasAttendanceData && <AttendanceRecommendations cells={cells} selectedDoctorId={doctorId} regression={regression} offDayAssessments={offDayAssessments} />}
      <AttendanceHeatmapCellDetails cell={selectedCell} open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCell(null)} />
    </div>
  );
}
