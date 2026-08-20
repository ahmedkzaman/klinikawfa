import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { averageShiftExpectedVisits } from '@/components/clinic/insight/planning/coverageMath';
import type { AttendancePeriodAnalysis } from '@/lib/clinic/attendancePeriodAnalysis';
import type { AttendanceRegressionObservation, AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

const shifts = [
  { key: 'S1', label: '08:00–13:00', startHour: 8, endHour: 13 },
  { key: 'S2', label: '14:00–19:00', startHour: 14, endHour: 19 },
  { key: 'S3', label: '20:00–00:00', startHour: 20, endHour: 24 },
] as const;
function display(value: number | null, suffix = ''): string { return value === null ? 'Unavailable' : `${value.toFixed(1)}${suffix}`; }

export function DoctorCoveragePlan({ analysis, regression, observations, doctors }: {
  analysis: AttendancePeriodAnalysis;
  regression: AttendanceRegressionResult;
  observations: AttendanceRegressionObservation[];
  doctors: Array<{ id: string; name: string }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Doctor coverage plan</CardTitle><p className="text-sm text-slate-500">Shift coverage uses rostered doctor counts and regression demand; it does not infer a staffing warning from a raw visit-count threshold.</p></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-2">Shift</th><th className="p-2">Rostered doctors</th><th className="p-2">Expected visits</th><th className="p-2">Patients / doctor-hour</th><th className="p-2">Confidence</th><th className="p-2">Coverage note</th></tr></thead>
          <tbody>{shifts.map((shift) => {
            const forecast = regression.status === 'ready' ? regression.hourly.filter(item => item.hour >= shift.startHour && item.hour < shift.endHour) : [];
            const shiftObservations = observations.filter(item => item.hour >= shift.startHour && item.hour < shift.endHour);
            const averageDoctors = shiftObservations.length ? shiftObservations.reduce((sum, item) => sum + item.doctorsRostered, 0) / shiftObservations.length : null;
            const expectedVisits = forecast.length === (shift.endHour - shift.startHour) * new Set(forecast.map(item => item.weekday)).size
              ? averageShiftExpectedVisits(forecast)
              : null;
            const matchedPeriods = analysis.periods.filter(period => period.startHour < shift.endHour && period.endHour > shift.startHour);
            const confidence = matchedPeriods.some(period => period.confidence === 'insufficient') ? 'insufficient' : matchedPeriods.some(period => period.confidence === 'moderate') ? 'moderate' : 'high';
            const warning = expectedVisits === null ? 'Regression forecast unavailable for this shift.' : confidence === 'insufficient' ? 'Coverage needs review because its model/data confidence is insufficient.' : matchedPeriods.flatMap(period => period.safetyReasons)[0] ?? 'Coverage signal is within the regression assessment.';
            return <tr key={shift.key} className="border-b align-top"><td className="p-2 font-medium">{shift.key} · {shift.label}</td><td className="p-2">{display(averageDoctors)} average rostered<br /><span className="text-xs text-slate-500">Attendance scope: {doctors.length ? doctors.map(doctor => doctor.name).join(', ') : 'No named roster data'}</span></td><td className="p-2">{display(expectedVisits)}</td><td className="p-2">{display(expectedVisits === null || averageDoctors === null || averageDoctors === 0 ? null : expectedVisits / (averageDoctors * (shift.endHour - shift.startHour)))}</td><td className="p-2 capitalize">{confidence}</td><td className="p-2 text-slate-600">{warning}</td></tr>;
          })}</tbody>
        </table>
        <p className="mt-4 text-sm text-slate-600">Approved OT hours/pay and locum pay remain aggregate-only operations inputs in the Management Dashboard. Individual salary and pay are not exposed in Planning.</p>
      </CardContent>
    </Card>
  );
}
