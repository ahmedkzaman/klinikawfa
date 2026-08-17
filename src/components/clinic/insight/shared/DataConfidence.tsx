import { Badge } from '@/components/ui/badge';
import type { DataConfidence as DataConfidenceModel } from '@/lib/clinic/insight/dataConfidence';

const LABELS = {
  reliable: 'Reliable',
  partial: 'Partial',
  insufficient: 'Insufficient',
} as const;

const STYLES = {
  reliable: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  insufficient: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

function refreshLabel(value: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function DataConfidence({
  confidence,
  definition,
  label,
}: {
  confidence: DataConfidenceModel;
  definition: string;
  label: string;
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
        <span>{label}</span>
        <Badge variant="outline" className={STYLES[confidence.level]}>{LABELS[confidence.level]}</Badge>
      </summary>
      <dl className="mt-3 grid gap-2 leading-5 sm:grid-cols-2">
        <div><dt className="font-semibold text-slate-700">Definition</dt><dd>{definition}</dd></div>
        <div><dt className="font-semibold text-slate-700">Reason</dt><dd>{confidence.reason}</dd></div>
        <div><dt className="font-semibold text-slate-700">Date basis</dt><dd>{confidence.dateBasis}</dd></div>
        <div><dt className="font-semibold text-slate-700">Source</dt><dd>{confidence.source}</dd></div>
        <div><dt className="font-semibold text-slate-700">Last refreshed</dt><dd>{refreshLabel(confidence.lastRefreshedAt)}</dd></div>
        <div>
          <dt className="font-semibold text-slate-700">Missing records</dt>
          <dd>
            {confidence.missingCount} affected · {confidence.missingBreakdown.unobservedRows} unobserved ·{' '}
            {confidence.missingBreakdown.attributionRows} attribution ·{' '}
            {confidence.missingBreakdown.incompleteCostRows} incomplete cost (counters may overlap)
          </dd>
        </div>
      </dl>
    </details>
  );
}
