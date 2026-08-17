import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AttendancePeriodSummary } from '@/lib/clinic/attendancePeriodAnalysis';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function timeRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function periodRange(period: AttendancePeriodSummary): string {
  return `${String(period.startHour).padStart(2, '0')}:00–${String(period.endHour % 24).padStart(2, '0')}:00`;
}

export function AttendancePeriodDetails({ period, open, onOpenChange }: { period: AttendancePeriodSummary | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!period) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="attendance-period-detail-description" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attendance details</DialogTitle>
          <DialogDescription id="attendance-period-detail-description">{weekdays[period.weekday - 1]} {periodRange(period)}. Aggregate regression and operational data only.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Predicted visits: <strong>{period.expectedVisits === null ? 'Unavailable' : period.expectedVisits.toFixed(1)}</strong></p>
          <p>Prediction range: <strong>{period.lowerPrediction === null || period.upperPrediction === null ? 'Unavailable' : `${period.lowerPrediction.toFixed(1)}–${period.upperPrediction.toFixed(1)}`}</strong></p>
          <p>Traffic: <strong>{period.trafficLevel}</strong></p>
          <p>Confidence: <strong>{period.confidence}</strong></p>
          <p>Training suitability: <strong>{period.safeForTraining ? 'Eligible' : 'Not eligible'}</strong></p>
        </div>
        {period.safetyReasons.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">{period.safetyReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        <div>
          <h3 className="text-sm font-semibold">Hourly regression evidence</h3>
          <div className="mt-2 space-y-2">
            {period.hourly.map(({ forecast, cell }) => <div key={forecast.hour} className="rounded-md bg-slate-50 p-3 text-sm"><p className="font-medium">{timeRange(forecast.hour)}</p><div className="mt-1 grid gap-1 sm:grid-cols-2"><p>Predicted visits: <strong>{forecast.expectedVisits.toFixed(1)}</strong></p><p>Prediction range: <strong>{forecast.lowerPrediction.toFixed(1)}–{forecast.upperPrediction.toFixed(1)}</strong></p><p>Observed average: <strong>{forecast.observedAverage.toFixed(1)}</strong></p><p>Observed median: <strong>{forecast.observedMedian.toFixed(1)}</strong></p><p>Observed peak: <strong>{forecast.observedPeak.toFixed(1)}</strong></p><p>Recent trend: <strong>{forecast.recentTrend === null ? 'Unavailable' : forecast.recentTrend.toFixed(1)}</strong></p><p>Average wait: <strong>{forecast.averageWaitMinutes === null ? 'Unavailable' : `${forecast.averageWaitMinutes.toFixed(1)} min`}</strong></p><p>Operating sample: <strong>{cell?.operatingOccurrences ?? 'Unavailable'}</strong></p></div></div>)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
