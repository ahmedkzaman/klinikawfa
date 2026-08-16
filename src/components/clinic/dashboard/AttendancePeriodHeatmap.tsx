import type { AttendancePeriodAnalysis, AttendancePeriodSummary } from '@/lib/clinic/attendancePeriodAnalysis';
import { cn } from '@/lib/utils';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function trafficLabel(period: AttendancePeriodSummary): string {
  if (period.status !== 'ready') return period.status === 'uncovered' ? 'Uncovered' : period.status === 'insufficient' ? 'Insufficient data' : 'Unavailable';
  return period.trafficLevel === 'low' ? 'Low' : period.trafficLevel === 'high' ? 'High' : 'Moderate';
}

function trafficClass(period: AttendancePeriodSummary): string {
  if (period.status !== 'ready') return 'bg-slate-100 text-slate-600';
  if (period.trafficLevel === 'high') return 'bg-blue-700 text-white';
  if (period.trafficLevel === 'low') return 'bg-blue-100 text-blue-950';
  return 'bg-blue-300 text-blue-950';
}

export function AttendancePeriodHeatmap({ analysis, onSelectPeriod }: { analysis: AttendancePeriodAnalysis; onSelectPeriod: (period: AttendancePeriodSummary) => void }) {
  return (
    <div className="overflow-x-auto" aria-label="Compact attendance heatmap" tabIndex={0}>
      <div className="grid min-w-[680px] grid-cols-[96px_repeat(4,minmax(130px,1fr))] gap-px rounded-md border bg-slate-200 p-px">
        <div className="bg-white p-2 text-xs font-semibold text-slate-600">Day</div>
        {analysis.periods.filter((period) => period.weekday === 1).map((period) => <div key={period.periodId} className="bg-white p-2 text-center text-xs font-semibold text-slate-600">{period.label}</div>)}
        {weekdays.map((day, index) => (
          <div key={day} className="contents">
            <div className="bg-white p-2 text-xs font-medium text-slate-600">{day}</div>
            {analysis.periods.filter((period) => period.weekday === index + 1).map((period) => (
              <button
                key={`${day}-${period.periodId}`}
                type="button"
                onClick={() => onSelectPeriod(period)}
                aria-label={`${day} ${period.label}: ${trafficLabel(period)}, predicted ${period.expectedVisits === null ? 'unavailable' : period.expectedVisits.toFixed(1)} visits`}
                className={cn('min-h-16 p-2 text-center text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950', trafficClass(period))}
              >
                <span className="block font-semibold">{period.expectedVisits === null ? '—' : period.expectedVisits.toFixed(1)}</span>
                <span className="mt-1 block text-[10px] leading-tight">{trafficLabel(period)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
