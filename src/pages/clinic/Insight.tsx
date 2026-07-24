import { useCallback, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarIcon,
  TrendingUp,
  Wallet,
  Percent,
  PackageMinus,
  Download,
} from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  primaryBtn,
  secondaryBtn,
  softTile,
  chartGridStroke,
  chartAxisStroke,
  chartTickFill,
  chartTooltipStyle,
  chartColors,
} from '@/lib/clinic/bentoTokens';

import { useFinancialInsights, type RawFinancialRow } from '@/hooks/clinic/useFinancialInsights';
import { useSalesInsights, type SalesInsightRow } from '@/hooks/clinic/useSalesInsights';
import { ScoreboardsTab } from '@/components/clinic/insight/ScoreboardsTab';
import { LeaderboardsTab } from '@/components/clinic/insight/LeaderboardsTab';
import { ValuationTab } from '@/components/clinic/insight/ValuationTab';
import { BankHealthTab } from '@/components/clinic/insight/BankHealthTab';

const SEGMENT_COLORS = [chartColors.emerald, chartColors.blue, chartColors.slate];
const MAX_RANGE_DAYS = 365;

function formatRM(value: number) {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCSV(rows: RawFinancialRow[], startDate: Date, endDate: Date) {
  const header = ['visit_date', 'queue_entry_id', 'payment_method', 'item_name', 'revenue', 'cogs', 'profit'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.visit_date),
      csvEscape(r.queue_entry_id),
      csvEscape(r.payment_method),
      csvEscape(r.item_name),
      csvEscape(r.revenue.toFixed(2)),
      csvEscape(r.cogs.toFixed(2)),
      csvEscape(r.profit.toFixed(2)),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clinic_financials_${format(startDate, 'yyyyMMdd')}_to_${format(endDate, 'yyyyMMdd')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadSalesCSV(rows: SalesInsightRow[], startDate: Date, endDate: Date) {
  const header = ['created_at', 'payment_id', 'queue_entry_id', 'consultation_id', 'payment_type', 'payment_method', 'amount'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.createdAt),
      csvEscape(r.paymentId),
      csvEscape(r.queueEntryId),
      csvEscape(r.consultationId),
      csvEscape(r.paymentType),
      csvEscape(r.paymentMethod),
      csvEscape(r.amount.toFixed(2)),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clinic_sales_${format(startDate, 'yyyyMMdd')}_to_${format(endDate, 'yyyyMMdd')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Insight() {
  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const handleRangeSelect = useCallback((next: DateRange | undefined) => {
    if (!next?.from || !next?.to) {
      setRange(next);
      return;
    }
    if (next.from > next.to) {
      toast.warning('Start date cannot be after end date.');
      return;
    }
    if (differenceInCalendarDays(next.to, next.from) > MAX_RANGE_DAYS) {
      toast.warning('Date range limited to 1 year for performance.');
      setRange({ from: next.from, to: subDays(next.from, -MAX_RANGE_DAYS) });
      return;
    }
    setRange(next);
  }, []);

  const startDate = range?.from ?? subDays(new Date(), 29);
  const endDate = range?.to ?? new Date();

  const { data, isLoading, isError, error } = useFinancialInsights(startDate, endDate);
  const {
    data: salesData,
    isLoading: salesLoading,
    isError: salesIsError,
    error: salesError,
  } = useSalesInsights(startDate, endDate);

  const summary = data?.summary;
  const topItems = data?.topItems ?? [];
  const ltvSegment = data?.ltvSegment ?? [];
  const rows = data?.rows ?? [];

  const salesSummary = salesData?.summary;
  const salesByMethod = salesData?.byMethod ?? [];
  const salesRows = salesData?.rows ?? [];

  const chartData = useMemo(
    () =>
      (data?.dailyTrends ?? []).map((d) => ({
        date: format(new Date(d.date), 'd MMM'),
        Revenue: Number(d.revenue.toFixed(2)),
        COGS: Number(d.cogs.toFixed(2)),
        Margin: d.revenue > 0 ? Number(((d.profit / d.revenue) * 100).toFixed(1)) : 0,
      })),
    [data?.dailyTrends],
  );

  const salesChartData = useMemo(
    () =>
      (salesData?.dailyTrends ?? []).map((d) => ({
        date: format(new Date(d.date), 'd MMM'),
        Collected: Number(d.collected.toFixed(2)),
      })),
    [salesData?.dailyTrends],
  );

  const handleDownload = () => {
    if (rows.length === 0) return;
    downloadCSV(rows, startDate, endDate);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} to CSV.`);
  };

  const handleSalesDownload = () => {
    if (salesRows.length === 0) return;
    downloadSalesCSV(salesRows, startDate, endDate);
    toast.success(`Exported ${salesRows.length} sales row${salesRows.length === 1 ? '' : 's'} to CSV.`);
  };

  const TAB_TRIGGER =
    'rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm';

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financial Insights</h1>
            <p className="text-sm text-slate-500">
              Collected payments and consultation profitability, shown as separate measures.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    secondaryBtn,
                    'w-full sm:w-[280px] justify-start text-left font-normal',
                    !range && 'text-slate-400',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range?.from ? (
                    range.to ? (
                      <>
                        {format(range.from, 'd MMM yyyy')} - {format(range.to, 'd MMM yyyy')}
                      </>
                    ) : (
                      format(range.from, 'd MMM yyyy')
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-[0_8px_30px_rgb(0,0,0,0.08)]" align="end">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={handleRangeSelect}
                  numberOfMonths={2}
                  defaultMonth={range?.from}
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>

            <Button
              onClick={handleDownload}
              disabled={isLoading || rows.length === 0}
              className={primaryBtn}
            >
              <Download className="mr-2 h-4 w-4" />
              Consultation CSV
            </Button>

            <Button
              onClick={handleSalesDownload}
              disabled={salesLoading || salesRows.length === 0}
              variant="outline"
              className={secondaryBtn}
            >
              <Download className="mr-2 h-4 w-4" />
              Collected CSV
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full space-y-4">
          <Card className={cn(bento, 'p-2')}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="overview" className={TAB_TRIGGER}>Overview</TabsTrigger>
              <TabsTrigger value="scoreboards" className={TAB_TRIGGER}>Scoreboards</TabsTrigger>
              <TabsTrigger value="leaderboards" className={TAB_TRIGGER}>Leaderboards</TabsTrigger>
              <TabsTrigger value="valuation" className={TAB_TRIGGER}>Valuation</TabsTrigger>
              <TabsTrigger value="health" className={TAB_TRIGGER}>Bank Health</TabsTrigger>
            </TabsList>
          </Card>

          <TabsContent value="overview" className="space-y-4 mt-0">
            {isError && (
              <Card className={bento}>
                <CardContent className="py-6 text-sm text-rose-600">
                  Failed to load insights: {(error as Error)?.message ?? 'Unknown error'}
                </CardContent>
              </Card>
            )}

            {salesIsError && (
              <Card className={bento}>
                <CardContent className="py-6 text-sm text-rose-600">
                  Failed to load collected payments: {(salesError as Error)?.message ?? 'Unknown error'}
                </CardContent>
              </Card>
            )}

            {isLoading || salesLoading ? (
              <InsightSkeleton />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <SummaryCard
                    icon={<Wallet className="h-4 w-4" />}
                    label="Total Collected"
                    value={salesSummary ? formatRM(salesSummary.totalCollected) : '-'}
                  />
                  <SummaryCard
                    icon={<Wallet className="h-4 w-4" />}
                    label="Consultation Revenue"
                    value={summary ? formatRM(summary.totalRevenue) : '-'}
                  />
                  <SummaryCard
                    icon={<PackageMinus className="h-4 w-4" />}
                    label="COGS"
                    value={summary ? formatRM(summary.totalCogs) : '-'}
                  />
                  <SummaryCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="Gross Profit"
                    value={summary ? formatRM(summary.totalProfit) : '-'}
                  />
                  <SummaryCard
                    icon={<Percent className="h-4 w-4" />}
                    label="Gross Margin"
                    value={summary ? `${summary.marginPct.toFixed(1)}%` : '-'}
                  />
                </div>

                <Card className={bento}>
                  <CardContent className="p-6">
                    <div className="mb-3">
                      <h3 className={bentoHeader}>Collected Sales</h3>
                      <p className="text-xs text-slate-500">
                        Every active payment recorded in the selected period, including dispensary collections.
                      </p>
                    </div>
                    {salesChartData.length === 0 ? (
                      <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
                        No payment collections in this period.
                      </div>
                    ) : (
                      <div className="h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={salesChartData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                            <XAxis dataKey="date" stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={12} />
                            <YAxis
                              stroke={chartAxisStroke}
                              tick={{ fill: chartTickFill }}
                              fontSize={12}
                              tickFormatter={(v: number) => `RM ${v}`}
                            />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => formatRM(value)} />
                            <Bar dataKey="Collected" fill={chartColors.blue} radius={[6, 6, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {salesByMethod.length > 0 && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {salesByMethod.slice(0, 3).map((method) => (
                          <div key={method.method} className={softTile}>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              {method.method}
                            </div>
                            <div className="text-lg font-semibold text-slate-900">
                              {formatRM(method.collected)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {method.paymentCount} payment{method.paymentCount === 1 ? '' : 's'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className={bento}>
                  <CardContent className="p-6">
                    <div className="mb-3">
                      <h3 className={bentoHeader}>Daily Consultation Revenue vs COGS</h3>
                      <p className="text-xs text-slate-500">
                        Completed consultation items only; this is the basis for gross profit and margin.
                      </p>
                    </div>
                    {chartData.length === 0 ? (
                      <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">
                        No completed consultations in this period.
                      </div>
                    ) : (
                      <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                            <XAxis dataKey="date" stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={12} />
                            <YAxis
                              yAxisId="left"
                              stroke={chartAxisStroke}
                              tick={{ fill: chartTickFill }}
                              fontSize={12}
                              tickFormatter={(v) => `RM ${v}`}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              domain={[0, 100]}
                              stroke={chartAxisStroke}
                              tick={{ fill: chartTickFill }}
                              fontSize={12}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={chartTooltipStyle}
                              formatter={(value: number, name: string) =>
                                name === 'Margin' ? `${value.toFixed(1)}%` : formatRM(value)
                              }
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar yAxisId="left" dataKey="Revenue" fill={chartColors.emerald} radius={[6, 6, 0, 0]} />
                            <Bar yAxisId="left" dataKey="COGS" fill={chartColors.slate} radius={[6, 6, 0, 0]} />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="Margin"
                              stroke={chartColors.blue}
                              strokeWidth={2}
                              dot={false}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className={bento}>
                    <CardContent className="p-6">
                      <div className="mb-3">
                        <h3 className={bentoHeader}>Top 10 Profit Leaders</h3>
                      </div>
                      {topItems.length === 0 ? (
                        <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
                          No items to rank.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-100 hover:bg-transparent">
                              <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Item</TableHead>
                              <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Revenue</TableHead>
                              <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">COGS</TableHead>
                              <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Profit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topItems.map((item) => (
                              <TableRow key={item.itemName} className="border-slate-100">
                                <TableCell className="font-medium text-slate-800">{item.itemName}</TableCell>
                                <TableCell className="text-right text-slate-500">{formatRM(item.revenue)}</TableCell>
                                <TableCell className="text-right text-slate-500">{formatRM(item.cogs)}</TableCell>
                                <TableCell className="text-right font-semibold text-slate-900">
                                  {formatRM(item.profit)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  <Card className={bento}>
                    <CardContent className="p-6">
                      <div className="mb-3">
                        <h3 className={bentoHeader}>Profit by Segment (LTV)</h3>
                      </div>
                      {ltvSegment.length === 0 ? (
                        <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
                          No segmentation data available.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                          <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={ltvSegment}
                                  dataKey="totalProfit"
                                  nameKey="segment"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={50}
                                  outerRadius={90}
                                  paddingAngle={2}
                                >
                                  {ltvSegment.map((entry, index) => (
                                    <Cell
                                      key={entry.segment}
                                      fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={chartTooltipStyle}
                                  formatter={(value: number) => formatRM(value)}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-2">
                            {ltvSegment.map((seg, index) => (
                              <div key={seg.segment} className={softTile}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                      background: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                                    }}
                                  />
                                  <span className="text-sm font-medium text-slate-700">{seg.segment}</span>
                                </div>
                                <div className="text-xs text-slate-500">
                                  {seg.patientCount} patient{seg.patientCount === 1 ? '' : 's'}
                                </div>
                                <div className="text-sm font-semibold text-slate-900 mt-1">
                                  Avg profit: {formatRM(seg.avgProfitPerPatient)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="scoreboards" className="mt-0">
            <ScoreboardsTab startDate={startDate} endDate={endDate} />
          </TabsContent>

          <TabsContent value="leaderboards" className="mt-0">
            <LeaderboardsTab startDate={startDate} endDate={endDate} />
          </TabsContent>

          <TabsContent value="valuation" className="mt-0">
            <ValuationTab startDate={startDate} endDate={endDate} />
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <BankHealthTab startDate={startDate} endDate={endDate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className={bento}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
          <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600">{icon}</div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function InsightSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className={bento}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className={bento}>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className={bento}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
