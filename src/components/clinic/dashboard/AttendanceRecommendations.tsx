import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildAttendanceRecommendations, type AttendanceHeatmapCell } from '@/lib/clinic/attendanceHeatmap';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function evidence(item: { sampleSize: number; evidence: { averageVisits: number | null; peakVisits: number | null; averageWaitMinutes: number | null } }): string {
  const values = [`${item.sampleSize} operating-date samples`, `average ${item.evidence.averageVisits ?? 'unavailable'} visits`];
  if (item.evidence.peakVisits !== null) values.push(`peak ${item.evidence.peakVisits}`);
  if (item.evidence.averageWaitMinutes !== null) values.push(`${item.evidence.averageWaitMinutes} min average wait`);
  return values.join(' · ');
}

export function AttendanceRecommendations({ cells, selectedDoctorId }: {
  cells: AttendanceHeatmapCell[];
  selectedDoctorId: string | null;
}) {
  const recommendations = buildAttendanceRecommendations(cells, selectedDoctorId);
  const sections = [
    {
      title: 'Training windows',
      items: recommendations.trainingWindows,
      description: (item: typeof recommendations.trainingWindows[number]) => `${weekdays[item.weekday - 1]} ${hour(item.startHour)}–${hour(item.endHour)} · Training window · ${evidence(item)}`,
    },
    {
      title: 'Possible doctor off-day — suggestion only',
      items: recommendations.possibleDoctorOffDays,
      description: (item: typeof recommendations.possibleDoctorOffDays[number]) => `${weekdays[item.weekday - 1]} · Possible doctor off-day — suggestion only · ${evidence(item)}`,
    },
    {
      title: 'Peak staffing',
      items: recommendations.peakStaffing,
      description: (item: typeof recommendations.peakStaffing[number]) => `${weekdays[item.weekday - 1]} ${hour(item.hour)} · Peak staffing review · ${evidence(item)}`,
    },
    {
      title: 'Unstable periods',
      items: recommendations.unstablePeaks,
      description: (item: typeof recommendations.unstablePeaks[number]) => `${weekdays[item.weekday - 1]} ${hour(item.hour)} · Unstable period · ${evidence(item)}`,
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
            {section.items.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No evidence-based recommendation for this period.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {section.items.map((item, index) => <li key={`${item.weekday}-${'hour' in item ? item.hour : 'day'}-${index}`} className="rounded-md bg-slate-50 p-2">{section.description(item as never)}</li>)}
              </ul>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
