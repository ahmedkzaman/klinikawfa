import { CheckCircle2, Circle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MANAGEMENT_METRIC_DEFINITIONS, type DashboardManualMetric, type ManagementMetricKey, type MetricGroup } from '@/lib/clinic/managementDashboard';

export function ManualScorecardPanel({ title, group, metrics, canEdit, onEdit }: {
  title: string;
  group: MetricGroup;
  metrics: DashboardManualMetric[];
  canEdit: boolean;
  onEdit: (key: ManagementMetricKey) => void;
}) {
  const byKey = new Map(metrics.map((row) => [row.metric_key, row]));
  const definitions = Object.entries(MANAGEMENT_METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.group === group)
    .filter(([key]) => group !== 'operations' || !['gross_revenue_target','locum_pay','stock_purchase_manual','stock_availability_feedback','initiative_a','initiative_b','initiative_c'].includes(key));

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {definitions.map(([rawKey, definition]) => {
          const key = rawKey as ManagementMetricKey;
          const row = byKey.get(key);
          const done = row?.status === 'done' || (definition.kind === 'checkbox' && (row?.actual_numeric ?? 0) >= 1);
          const display = definition.kind === 'rating' ? `${row?.actual_numeric ?? '—'} / 5`
            : definition.kind === 'currency' ? (row?.actual_numeric == null ? '—' : `RM ${row.actual_numeric.toLocaleString()}`)
            : definition.kind === 'checkbox' ? (done ? 'Completed' : 'Pending')
            : row?.actual_numeric ?? row?.status?.replace('_', ' ') ?? '—';
          return <div key={key} className="flex items-center gap-3 rounded-xl border p-3">{done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{definition.label}</p><p className="text-xs capitalize text-slate-500">{display}{definition.target !== undefined && definition.kind !== 'checkbox' ? ` · target ${definition.target}` : ''}</p></div>{canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(key)} aria-label={`Edit ${definition.label}`}><Pencil className="h-3.5 w-3.5" /></Button>}</div>;
        })}
      </CardContent>
    </Card>
  );
}
