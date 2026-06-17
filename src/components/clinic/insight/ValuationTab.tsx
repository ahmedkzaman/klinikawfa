import { useMemo, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Inbox } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinancialInsights } from '@/hooks/clinic/useFinancialInsights';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  softInput,
  softTile,
  chartGridStroke,
  chartAxisStroke,
  chartTickFill,
  chartTooltipStyle,
  chartColors,
} from '@/lib/clinic/bentoTokens';

interface Props {
  startDate: Date;
  endDate: Date;
}

const WACC_ROWS = [8, 10, 12, 14, 16, 18, 20];
const GROWTH_COLS = [0, 5, 10, 15, 20, 25];
const REV_CAP = 5_000_000;
const PROJECTION_YEARS = 5;

function formatRM(val: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatCompact(val: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(val);
}

interface ProjectionRow {
  year: string;
  Revenue: number;
  'Gross Profit': number;
  FCF: number;
  'Discounted FCF': number;
}

interface DcfResult {
  ev: number;
  projections: ProjectionRow[];
  validTerminal: boolean;
}

function runDCF(
  annRev: number,
  cogsRatio: number,
  opex: number,
  growthPct: number,
  waccPct: number,
  terminalGrowthPct: number,
): DcfResult {
  const g = growthPct / 100;
  const wacc = waccPct / 100;
  const tg = terminalGrowthPct / 100;

  const projections: ProjectionRow[] = [];
  let totalDiscFcf = 0;

  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    const revenue = Math.min(annRev * Math.pow(1 + g, t), REV_CAP);
    const grossProfit = revenue * (1 - cogsRatio);
    const fcf = grossProfit - opex;
    const discFcf = fcf / Math.pow(1 + wacc, t);
    totalDiscFcf += discFcf;
    projections.push({
      year: `Year ${t}`,
      Revenue: revenue,
      'Gross Profit': grossProfit,
      FCF: fcf,
      'Discounted FCF': discFcf,
    });
  }

  const validTerminal = wacc > tg;
  let discTv = 0;
  if (validTerminal) {
    const lastFcf = projections[PROJECTION_YEARS - 1].FCF;
    const tv = (lastFcf * (1 + tg)) / (wacc - tg);
    discTv = tv / Math.pow(1 + wacc, PROJECTION_YEARS);
  }

  return { ev: totalDiscFcf + discTv, projections, validTerminal };
}

const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const TR = 'border-slate-100';

export function ValuationTab({ startDate, endDate }: Props) {
  const { data, isLoading, isError, error } = useFinancialInsights(startDate, endDate);

  const [growth, setGrowth] = useState(10);
  const [wacc, setWacc] = useState(12);
  const [terminalGrowth, setTerminalGrowth] = useState(2);
  const [customOpex, setCustomOpex] = useState<number | null>(null);

  const baseline = useMemo(() => {
    const summary = data?.summary;
    if (!summary || summary.totalRevenue === 0) return null;
    const days = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
    const annualizedRevenue = summary.totalRevenue * (365 / days);
    const cogsRatio = summary.totalCogs / summary.totalRevenue;
    return { annualizedRevenue, cogsRatio, days };
  }, [data, startDate, endDate]);

  const defaultOpex = baseline ? baseline.annualizedRevenue * 0.6 : 0;
  const opex = customOpex !== null ? customOpex : defaultOpex;

  const dcfModel = useMemo(() => {
    if (!baseline) return null;
    return runDCF(baseline.annualizedRevenue, baseline.cogsRatio, opex, growth, wacc, terminalGrowth);
  }, [baseline, opex, growth, wacc, terminalGrowth]);

  const matrix = useMemo(() => {
    if (!baseline) return [];
    return WACC_ROWS.map((r) => ({
      wacc: r,
      values: GROWTH_COLS.map((g) => {
        const res = runDCF(baseline.annualizedRevenue, baseline.cogsRatio, opex, g, r, terminalGrowth);
        return { growth: g, ev: res.ev, valid: res.validTerminal };
      }),
    }));
  }, [baseline, opex, terminalGrowth]);

  if (isError) {
    return (
      <Card className={bento}>
        <CardContent className="py-6 text-sm text-rose-600">
          Failed to load valuation baseline: {(error as Error)?.message ?? 'Unknown error'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={bento}>
        <CardContent className="py-6 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!baseline) {
    return (
      <Card className={bento}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-2xl bg-blue-50 p-4 mb-3">
            <Inbox className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No financial baseline available</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            Expand the date range to establish a revenue baseline for the DCF model.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isInvalidTerminal = !dcfModel!.validTerminal;
  const evPositive = dcfModel!.ev > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* INPUTS */}
        <Card className={cn(bento, 'lg:col-span-1')}>
          <CardContent className="p-6 space-y-5">
            <div>
              <h3 className={cn(bentoHeader, 'mb-1')}>Assumptions</h3>
              <p className="text-xs text-slate-500">Adjust levers to recalculate enterprise value.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-700">Expected Annual Growth</Label>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{growth}%</span>
              </div>
              <Slider value={[growth]} min={0} max={30} step={1} onValueChange={(v) => setGrowth(v[0])} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-700">Discount Rate (WACC)</Label>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{wacc}%</span>
              </div>
              <Slider value={[wacc]} min={5} max={25} step={1} onValueChange={(v) => setWacc(v[0])} />
              <p className="text-xs text-slate-500">Higher risk = higher discount rate.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-slate-700">Annual OpEx (MYR)</Label>
              <Input
                type="number"
                value={Math.round(opex)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCustomOpex(Number.isFinite(n) ? n : 0);
                }}
                className={softInput}
              />
              <p className="text-xs text-slate-500">
                Fixed costs: salaries, rent, utilities. Default 60% of annualised revenue.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-700">Terminal Growth Rate</Label>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{terminalGrowth}%</span>
              </div>
              <Slider
                value={[terminalGrowth]}
                min={0}
                max={5}
                step={1}
                onValueChange={(v) => setTerminalGrowth(v[0])}
              />
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-100 pt-3 space-y-1">
              <div>
                Baseline annualised revenue:{' '}
                <span className="font-medium text-slate-900">{formatRM(baseline.annualizedRevenue)}</span>
              </div>
              <div>
                COGS ratio:{' '}
                <span className="font-medium text-slate-900">
                  {(baseline.cogsRatio * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OUTPUTS */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            className={cn(
              bento,
              evPositive && 'bg-gradient-to-br from-emerald-50 to-white',
            )}
          >
            <CardContent className="p-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Estimated Enterprise Value (EV)
              </div>
              <div
                className={cn(
                  'text-4xl font-bold tracking-tight mt-2 tabular-nums',
                  evPositive ? 'text-emerald-700' : 'text-slate-900',
                )}
              >
                {formatRM(dcfModel!.ev)}
              </div>
              {isInvalidTerminal && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  WACC must exceed Terminal Growth. Terminal Value excluded.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={bento}>
            <CardContent className="p-6">
              <div className="mb-3">
                <h3 className={cn(bentoHeader, 'mb-1')}>5-Year Projection</h3>
                <p className="text-xs text-slate-500">
                  Revenue capped at {formatCompact(REV_CAP)}/year to avoid fantasy projections.
                </p>
              </div>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={dcfModel!.projections}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                    <XAxis dataKey="year" stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={12} />
                    <YAxis
                      stroke={chartAxisStroke}
                      tick={{ fill: chartTickFill }}
                      fontSize={12}
                      tickFormatter={(v: number) => formatCompact(v)}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => formatRM(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Revenue" fill={chartColors.emerald} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Gross Profit" fill={chartColors.slate} radius={[6, 6, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="Discounted FCF"
                      stroke={chartColors.blue}
                      strokeWidth={2}
                      dot={{ r: 3, fill: chartColors.blue }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SENSITIVITY MATRIX */}
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Sensitivity Matrix: EV by Growth vs WACC</h3>
            <p className="text-xs text-slate-500">
              Evaluates intrinsic value across different risk and expansion scenarios. Current selection
              is highlighted.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent')}>
                  <TableHead className={TH}>WACC \ Growth</TableHead>
                  {GROWTH_COLS.map((g) => (
                    <TableHead key={g} className={cn(TH, 'text-right')}>
                      {g}%
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map((row) => (
                  <TableRow key={row.wacc} className={TR}>
                    <TableCell className="font-medium text-sm text-slate-800">{row.wacc}%</TableCell>
                    {row.values.map((cell) => {
                      const isCurrent = row.wacc === wacc && cell.growth === growth;
                      return (
                        <TableCell
                          key={cell.growth}
                          className={cn(
                            'text-right text-sm tabular-nums text-slate-600',
                            isCurrent && 'bg-blue-50 text-blue-900 font-semibold ring-1 ring-blue-300 ring-inset rounded-lg',
                            !cell.valid && 'text-slate-300',
                          )}
                        >
                          {!cell.valid ? '—' : formatCompact(cell.ev)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-slate-500 italic mt-4">
            *Indicative model based on current margins and user assumptions. OpEx is held constant
            across all 5 years and may understate fixed-cost growth in high-growth scenarios. Not a
            substitute for professional financial valuation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
