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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
      ? 'text-muted-foreground'
      : delta > 0
        ? 'text-emerald-600'
        : 'text-rose-600';
  const deltaSign = delta > 0 ? '+' : '';

  return (
    <div className="border rounded-md p-3 bg-muted/20">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground mt-0.5">{fmtScore(score)}</div>
      <div className="text-xs text-foreground/80 mt-1">{raw}</div>
      <div className={`text-xs mt-1 ${deltaTone}`}>
        Prior: {fmtScore(priorScore)} ({deltaSign}
        {delta.toFixed(0)})
        <span className="text-muted-foreground"> · {rawPrior}</span>
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
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load Bank Health: {(error as Error)?.message ?? 'Unknown error'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
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
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold text-foreground">
            No financial data in either period
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank Health Radar</CardTitle>
          <CardDescription>
            <span className="font-medium text-emerald-700">{periodLabel}</span>
            {' vs '}
            <span className="font-medium text-slate-600">{priorPeriodLabel}</span>
            {' — five normalized axes (0–100). Higher is healthier on every axis.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="75%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Radar
                  name={priorPeriodLabel}
                  dataKey="prior"
                  stroke="#94a3b8"
                  fill="transparent"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
                <Radar
                  name={periodLabel}
                  dataKey="current"
                  stroke="#059669"
                  fill="#10b981"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => `${Math.round(value)} / 100`}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Behind the Scores</CardTitle>
          <CardDescription>
            What each axis is actually measuring in this clinic, right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
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

          <div className="mt-6 border-t pt-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What does 100 mean?</p>
            <p>
              <span className="font-medium text-foreground">Profitability:</span> 100 = every ringgit
              of revenue is profit (impossible in practice; 50–70 is excellent).
            </p>
            <p>
              <span className="font-medium text-foreground">Risk:</span> 100 = revenue evenly spread
              across many doctors; 0 = one doctor generates 100% of revenue.
            </p>
            <p>
              <span className="font-medium text-foreground">Efficiency:</span> 100 = average RM 80+
              gross profit per patient visit.
            </p>
            <p>
              <span className="font-medium text-foreground">Liquidity:</span> 100 = all revenue
              collected instantly via cash, QR, or card. 0 = entirely panel/insurance (delayed).
            </p>
            <p>
              <span className="font-medium text-foreground">Growth:</span> 50 = flat revenue
              period-over-period; 100 = +50% or better; 0 = −50% or worse.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
