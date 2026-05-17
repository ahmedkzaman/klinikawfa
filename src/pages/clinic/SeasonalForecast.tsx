import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, TrendingUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForecastLogicSheet } from '@/components/clinic/procurement/ForecastLogicSheet';
import {
  useSeasonalTrends,
  topDiagnosesForMonth,
  buildChartData,
  MONTH_LABELS,
  type SeasonalTrendRow,
} from '@/hooks/clinic/useForecasting';
import { useDiagnosisCorrelation, type DiagnosisCorrelationRow } from '@/hooks/clinic/useProcurementStats';

const LINE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--primary-light))',
  'hsl(var(--accent-light))',
  'hsl(var(--primary-glow))',
];

function nextMonth(): number {
  const m = new Date().getMonth() + 2; // 1-based + 1
  return ((m - 1) % 12) + 1;
}

function topItemsForGroup(
  corr: DiagnosisCorrelationRow[],
  group: string,
  limit = 3,
): DiagnosisCorrelationRow[] {
  return corr
    .filter((c) => c.diagnosis_group === group && (c.confidence_pct ?? 0) > 0)
    .sort((a, b) => (b.confidence_pct ?? 0) - (a.confidence_pct ?? 0))
    .slice(0, limit);
}

export default function SeasonalForecast() {
  const [targetMonth, setTargetMonth] = useState<number>(nextMonth());
  const [logicOpen, setLogicOpen] = useState(false);
  const { data: trends = [], isLoading: trendsLoading } = useSeasonalTrends();
  const { data: corr = [], isLoading: corrLoading } = useDiagnosisCorrelation({
    minLift: 0,
    includeUnlinked: false,
  });

  const topDx = useMemo<SeasonalTrendRow[]>(
    () => topDiagnosesForMonth(trends, targetMonth, 5),
    [trends, targetMonth],
  );

  const chartGroups = useMemo(() => topDx.map((d) => d.diagnosis_group), [topDx]);
  const chartData = useMemo(
    () => buildChartData(trends, chartGroups),
    [trends, chartGroups],
  );

  const maxYears = useMemo(() => {
    if (!trends.length) return 0;
    return Math.max(...trends.map((r) => r.years_active));
  }, [trends]);

  if (trendsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Seasonal Readiness Forecast
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historical case patterns combined with diagnosis ↔ inventory correlation —
            projecting what the clinic will need next.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLogicOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="h-4 w-4 mr-1.5" />
            How is this calculated?
          </Button>
          {maxYears > 0 && (
            <Badge variant="secondary">
              {maxYears} year{maxYears === 1 ? '' : 's'} of history
            </Badge>
          )}
          <div className="min-w-[180px]">
            <Select
              value={String(targetMonth)}
              onValueChange={(v) => setTargetMonth(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Target month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">12-Month Trend — Top 5 Diagnoses for {MONTH_LABELS[targetMonth - 1]}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartGroups.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No historical case data yet. Trends will appear once consultations accumulate.
            </div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(m: number) => MONTH_LABELS[m - 1]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    labelFormatter={(m) => MONTH_LABELS[(m as number) - 1]}
                  />
                  <Legend />
                  <ReferenceLine
                    x={targetMonth}
                    stroke="hsl(var(--accent))"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Target',
                      position: 'top',
                      fill: 'hsl(var(--accent))',
                      fontSize: 12,
                    }}
                  />
                  {chartGroups.map((g, i) => (
                    <Line
                      key={g}
                      type="monotone"
                      dataKey={g}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Readiness Checklist */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Readiness Checklist — {MONTH_LABELS[targetMonth - 1]}
        </h2>
        {corrLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : topDx.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No diagnosis history available for this month yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {topDx.map((dx) => {
              const items = topItemsForGroup(corr, dx.diagnosis_group, 3);
              return (
                <Card key={dx.diagnosis_group} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{dx.diagnosis_group}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Expected cases:{' '}
                      <span className="font-semibold text-foreground">
                        {dx.avg_expected_cases}
                      </span>
                      {dx.years_active > 0 && (
                        <span className="ml-2 text-xs">
                          ({dx.years_active}y history)
                        </span>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No correlated inventory items yet — needs more visit history.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-2">Item</TableHead>
                            <TableHead className="px-2 text-right">Confidence</TableHead>
                            <TableHead className="px-2 text-right">Need</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((it) => {
                            const conf = Number(it.confidence_pct ?? 0);
                            const need = Math.ceil(
                              (dx.avg_expected_cases * conf) / 100,
                            );
                            return (
                              <TableRow key={it.inventory_item_id}>
                                <TableCell className="px-2 font-medium">
                                  {it.item_name ?? '—'}
                                </TableCell>
                                <TableCell className="px-2 text-right">
                                  <Badge variant="outline">
                                    {conf.toFixed(0)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="px-2 text-right font-semibold">
                                  {need}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
