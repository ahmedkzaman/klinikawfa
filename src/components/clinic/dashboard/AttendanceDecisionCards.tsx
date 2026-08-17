import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceDecision, AttendanceDecisionSummary } from '@/lib/clinic/attendancePeriodAnalysis';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function decisionValue(decision: AttendanceDecision): string {
  if (decision.status !== 'ready' || decision.expectedVisits === null) return 'Unavailable';
  return `${decision.expectedVisits.toFixed(1)} predicted visits`;
}

function decisionLocation(decision: AttendanceDecision): string {
  if (decision.weekday === null) return 'No safe period identified';
  const weekday = weekdays[decision.weekday - 1];
  if (decision.periodId === null) return weekday;
  const labels = { '08_12': '08:00-12:00', '12_16': '12:00-16:00', '16_20': '16:00-20:00', '20_24': '20:00-00:00' } as const;
  return `${weekday}, ${labels[decision.periodId]}`;
}

function DecisionCard({ decision }: { decision: AttendanceDecision }) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{decision.title}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-lg font-semibold text-slate-950">{decisionLocation(decision)}</p>
        <p className="mt-1 text-sm text-slate-600">{decisionValue(decision)}</p>
        {decision.status === 'ready' && decision.lowerPrediction !== null && decision.upperPrediction !== null && <p className="text-xs text-slate-500">Range {decision.lowerPrediction.toFixed(1)}–{decision.upperPrediction.toFixed(1)} · {decision.confidence} confidence</p>}
        <p className="mt-2 text-xs text-slate-500">{decision.reason}</p>
      </CardContent>
    </Card>
  );
}

export function AttendanceDecisionCards({ decisions }: { decisions: AttendanceDecisionSummary }) {
  return (
    <section aria-label="Attendance decisions" className="grid gap-3 md:grid-cols-3">
      <DecisionCard decision={decisions.offDay} />
      <DecisionCard decision={decisions.training} />
      <DecisionCard decision={decisions.peak} />
    </section>
  );
}
