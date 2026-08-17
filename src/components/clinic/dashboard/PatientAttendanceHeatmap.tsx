import { useMemo, useState } from 'react';
import { AttendanceDecisionCards } from '@/components/clinic/dashboard/AttendanceDecisionCards';
import { AttendanceHeatmapCellDetails } from '@/components/clinic/dashboard/AttendanceHeatmapCellDetails';
import { AttendanceHourlyHeatmap } from '@/components/clinic/dashboard/AttendanceHourlyHeatmap';
import { AttendancePeriodDetails } from '@/components/clinic/dashboard/AttendancePeriodDetails';
import { AttendancePeriodHeatmap } from '@/components/clinic/dashboard/AttendancePeriodHeatmap';
import { AttendanceRecommendations } from '@/components/clinic/dashboard/AttendanceRecommendations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { attendancePresetRange, type AttendancePeriodPreset, useAttendanceHeatmap } from '@/hooks/clinic/useAttendanceHeatmap';
import { assessDoctorOffDays, type AttendanceHeatmapCell, type DoctorOffDayAssessment } from '@/lib/clinic/attendanceHeatmap';
import { buildAttendancePeriodAnalysis } from '@/lib/clinic/attendancePeriodAnalysis';
import { fitAttendanceRegression, type AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

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

function dateRangeIsValid(startDate: string, endDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    && startDate <= endDate
    && (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) <= 364 * 86_400_000;
}

export function PatientAttendanceHeatmap() {
  const initialRange = useMemo(() => attendancePresetRange({ preset: 'latest_12_weeks' }), []);
  const [preset, setPreset] = useState<AttendancePeriodPreset>('latest_12_weeks');
  const [customStartDate, setCustomStartDate] = useState(initialRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<AttendanceHeatmapCell | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<ReturnType<typeof buildAttendancePeriodAnalysis>['periods'][number] | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const range = preset === 'custom'
    ? { startDate: customStartDate, endDate: customEndDate }
    : attendancePresetRange({ preset });
  const invalidRange = !dateRangeIsValid(range.startDate, range.endDate);
  const query = useAttendanceHeatmap({
    startDate: range.startDate,
    endDate: range.endDate,
    doctorId,
    permissionDomain: 'management',
  });
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
  const periodAnalysis = useMemo(() => buildAttendancePeriodAnalysis({
    regression,
    cells,
    offDayAssessments,
    selectedDoctorId: doctorId,
  }), [regression, cells, offDayAssessments, doctorId]);

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
            <AttendanceDecisionCards decisions={periodAnalysis.decisions} />
            <AttendancePeriodHeatmap analysis={periodAnalysis} onSelectPeriod={setSelectedPeriod} />
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="rounded-md border px-3 py-2 text-sm font-medium text-slate-700">{advancedOpen ? 'Hide advanced detail' : 'Advanced detail'}</CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <AttendanceHourlyHeatmap cells={cells} onSelectCell={setSelectedCell} />
                <AttendanceRecommendations cells={cells} selectedDoctorId={doctorId} regression={regression} offDayAssessments={offDayAssessments} />
              </CollapsibleContent>
            </Collapsible>
          </>}
        </CardContent>
      </Card>
      <AttendancePeriodDetails period={selectedPeriod} open={selectedPeriod !== null} onOpenChange={(open) => !open && setSelectedPeriod(null)} />
      <AttendanceHeatmapCellDetails cell={selectedCell} open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCell(null)} />
    </div>
  );
}
