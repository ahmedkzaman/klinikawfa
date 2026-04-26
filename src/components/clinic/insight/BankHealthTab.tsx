import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Inbox } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  softTile,
  chartGridStroke,
  chartTooltipStyle,
  chartColors,
} from '@/lib/clinic/bentoTokens';
import { useBankHealth, type AxisContext } from '@/hooks/clinic/useBankHealth';

interface Props {
  startDate: Date;
  endDate: Date;
}

function fmtPct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

function fmtScore(n: number): string {
  return `${Math.round(n)} / 100`;
}

interface AxisCardProps {
  label: string;
  score: number;
  priorScore: number;
  raw: string;
  rawPrior: string;
}

function AxisCard({ label, score, priorScore, raw, rawPrior }: AxisCardProps) {
  const delta = score - priorScore;
  const deltaTone =
    Math.abs(delta) < 0.5
      ? 'text-slate-400'
      : delta > 0
        ? 'text-emerald-600'
        : 'text-rose-600';
  const deltaSign = delta > 0 ? '+' : '';

  return (
    <div className={softTile}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">{fmtScore(score)}</div>
      <div className="text-xs text-slate-700 mt-1">{raw}</div>
      <div className={cn('text-xs mt-1', deltaTone)}>
        Prior: {fmtScore(priorScore)} ({deltaSign}
        {delta.toFixed(0)})
        <span className="text-slate-400"> · {rawPrior}</span>
      </div>
    </div>
  );
}

function describeProfitability(c: AxisContext): string {
  return c.revenue > 0 ? `${fmtPct(c.marginPct, 1)} gross margin` : 'No revenue';
}
function describeRisk(c: AxisContext): string {
  return c.revenue > 0
    ? `${c.topDoctorName}: ${fmtPct(c.topDoctorSharePct, 0)} of revenue`
    : 'No revenue';
}
function describeEfficiency(c: AxisContext): string {
  return c.patientCount > 0
    ? `RM ${c.profitPerPatient.toFixed(0)} profit / visit (${c.patientCount} visits)`
    : 'No visits';
}
function describeLiquidity(c: AxisContext): string {
  return c.revenue > 0 ? `${fmtPct(c.liquidPct, 0)} instant-cash methods` : 'No revenue';
}
function describeGrowth(c: AxisContext, label: string): string {
  if (c.growthPct === null) return `No ${label.toLowerCase()} baseline`;
  const sign = c.growthPct > 0 ? '+' : '';
  return `${sign}${c.growthPct.toFixed(1)}% vs ${label.toLowerCase()}`;
}

export function BankHealthTab({ startDate, endDate }: Props) {
  const { data, isLoading, isError, error } = useBankHealth(startDate, endDate);

  if (isError) {
    return (
      <Card className={bento}>
        <CardContent className="py-6 text-sm text-rose-600">
          Failed to load Bank Health: {(error as Error)?.message ?? 'Unknown error'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card className={bento}>
        <CardContent className="py-6 space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-[420px] w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { chartData, current, prior, periodLabel, priorPeriodLabel } = data;
  const noData = current.revenue === 0 && prior.revenue === 0;

  if (noData) {
    return (
      <Card className={bento}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-2xl bg-blue-50 p-4 mb-3">
            <Inbox className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No financial data in either period
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            No completed consultations were recorded in {periodLabel.toLowerCase()} or{' '}
            {priorPeriodLabel.toLowerCase()}. Widen the date range to populate the radar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cs = chartData.reduce(
    (acc, p) => {
      acc[p.metric] = p;
      return acc;
    },
    {} as Record<string, (typeof chartData)[number]>,
  );

  return (
    <div className="space-y-4">
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Bank Health Radar</h3>
            <p className="text-xs text-slate-500">
              <span className="font-medium text-emerald-700">{periodLabel}</span>
              {' vs '}
              <span className="font-medium text-slate-600">{priorPeriodLabel}</span>
              {' — five normalized axes (0–100). Higher is healthier on every axis.'}
            </p>
          </div>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="75%">
                <PolarGrid stroke={chartGridStroke} />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 12, fill: '#334155' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <Radar
                  name={priorPeriodLabel}
                  dataKey="prior"
                  stroke={chartColors.slate}
                  fill="transparent"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
                <Radar
                  name={periodLabel}
                  dataKey="current"
                  stroke={chartColors.emeraldDark}
                  fill={chartColors.emerald}
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => `${Math.round(value)} / 100`}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Behind the Scores</h3>
            <p className="text-xs text-slate-500">
              What each axis is actually measuring in this clinic, right now.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <AxisCard
              label="Profitability"
              score={cs.Profitability.current}
              priorScore={cs.Profitability.prior}
              raw={describeProfitability(current)}
              rawPrior={describeProfitability(prior)}
            />
            <AxisCard
              label="Risk"
              score={cs.Risk.current}
              priorScore={cs.Risk.prior}
              raw={describeRisk(current)}
              rawPrior={describeRisk(prior)}
            />
            <AxisCard
              label="Efficiency"
              score={cs.Efficiency.current}
              priorScore={cs.Efficiency.prior}
              raw={describeEfficiency(current)}
              rawPrior={describeEfficiency(prior)}
            />
            <AxisCard
              label="Liquidity"
              score={cs.Liquidity.current}
              priorScore={cs.Liquidity.prior}
              raw={describeLiquidity(current)}
              rawPrior={describeLiquidity(prior)}
            />
            <AxisCard
              label="Growth"
              score={cs.Growth.current}
              priorScore={cs.Growth.prior}
              raw={describeGrowth(current, priorPeriodLabel)}
              rawPrior="Baseline reference"
            />
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">What does 100 mean?</p>
            <p>
              <span className="font-medium text-slate-700">Profitability:</span> 100 = every ringgit
              of revenue is profit (impossible in practice; 50–70 is excellent).
            </p>
            <p>
              <span className="font-medium text-slate-700">Risk:</span> 100 = revenue evenly spread
              across many doctors; 0 = one doctor generates 100% of revenue.
            </p>
            <p>
              <span className="font-medium text-slate-700">Efficiency:</span> 100 = average RM 80+
              gross profit per patient visit.
            </p>
            <p>
              <span className="font-medium text-slate-700">Liquidity:</span> 100 = all revenue
              collected instantly via cash, QR, or card. 0 = entirely panel/insurance (delayed).
            </p>
            <p>
              <span className="font-medium text-slate-700">Growth:</span> 50 = flat revenue
              period-over-period; 100 = +50% or better; 0 = −50% or worse.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
