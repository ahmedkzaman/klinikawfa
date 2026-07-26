import { Card, CardContent } from '@/components/ui/card';
import type { ClinicHealthScore } from '@/lib/clinic/insight/healthScore';

export function HealthScoreCard({ score }: { score: ClinicHealthScore }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clinic Health Score</p>
            <p className="mt-1 text-xs text-slate-500">Transparent score from current operational data.</p>
          </div>
          <div className="text-3xl font-bold text-slate-900">{score.total === null ? '—' : Math.round(score.total)}</div>
        </div>
        {score.status === 'insufficient-data' ? (
          <p className="mt-4 text-sm text-amber-700">Not enough data to score.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(score.dimensions).map(([key, dimension]) => (
              <div key={key} className="rounded-xl bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{key}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{Math.round(dimension.score)}</div>
                <div className="mt-1 text-xs text-slate-500">{dimension.explanation}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
