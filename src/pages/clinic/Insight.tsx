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
import { CalendarIcon, TrendingUp, Wallet, Percent, PackageMinus, Download, Inbox } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useFinancialInsights,
  type RawFinancialRow,
} from '@/hooks/clinic/useFinancialInsights';
import { ScoreboardsTab } from '@/components/clinic/insight/ScoreboardsTab';
import { LeaderboardsTab } from '@/components/clinic/insight/LeaderboardsTab';
import { ValuationTab } from '@/components/clinic/insight/ValuationTab';
import { BankHealthTab } from '@/components/clinic/insight/BankHealthTab';

const SEGMENT_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))'];
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
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(rows: RawFinancialRow[], startDate: Date, endDate: Date) {
  const header = ['visit_date', 'queue_entry_id', 'payment_method', 'item_name', 'revenue', 'cogs', 'profit'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.visit_date),
        csvEscape(r.queue_entry_id),
        csvEscape(r.payment_method),
        csvEscape(r.item_name),
        csvEscape(r.revenue.toFixed(2)),
        csvEscape(r.cogs.toFixed(2)),
        csvEscape(r.profit.toFixed(2)),
      ].join(','),
    );
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

  const summary = data?.summary;
  const dailyTrends = data?.dailyTrends ?? [];
  const topItems = data?.topItems ?? [];
  const ltvSegment = data?.ltvSegment ?? [];
  const rows = data?.rows ?? [];

  const chartData = useMemo(
    () =>
      dailyTrends.map((d) => ({
        date: format(new Date(d.date), 'd MMM'),
        Revenue: Number(d.revenue.toFixed(2)),
        COGS: Number(d.cogs.toFixed(2)),
        Margin: d.revenue > 0 ? Number(((d.profit / d.revenue) * 100).toFixed(1)) : 0,
      })),
    [dailyTrends],
  );

  const isEmpty = !isLoading && !isError && rows.length === 0;

  const handleDownload = () => {
    if (rows.length === 0) return;
    downloadCSV(rows, startDate, endDate);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} to CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Financial Insights</h1>
          <p className="text-sm text-muted-foreground">
            Revenue, COGS & gross margin analytics across consultations.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full sm:w-[280px] justify-start text-left font-normal',
                  !range && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range?.from ? (
                  range.to ? (
                    <>
                      {format(range.from, 'd MMM yyyy')} – {format(range.to, 'd MMM yyyy')}
                    </>
                  ) : (
                    format(range.from, 'd MMM yyyy')
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
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
            variant="outline"
            onClick={handleDownload}
            disabled={isLoading || rows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scoreboards">Scoreboards</TabsTrigger>
          <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="health">Bank Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {isError && (
            <Card>
              <CardContent className="py-6 text-sm text-destructive">
                Failed to load insights: {(error as Error)?.message ?? 'Unknown error'}
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <InsightSkeleton />
          ) : isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-semibold text-foreground">No financial data found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              No completed consultations were recorded in the selected date range. Try widening the
              window or pick a different period.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<Wallet className="h-4 w-4" />}
              label="Total Revenue"
              value={summary ? formatRM(summary.totalRevenue) : '—'}
            />
            <SummaryCard
              icon={<PackageMinus className="h-4 w-4" />}
              label="COGS"
              value={summary ? formatRM(summary.totalCogs) : '—'}
            />
            <SummaryCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Gross Profit"
              value={summary ? formatRM(summary.totalProfit) : '—'}
            />
            <SummaryCard
              icon={<Percent className="h-4 w-4" />}
              label="Gross Margin %"
              value={summary ? `${summary.marginPct.toFixed(1)}%` : '—'}
            />
          </div>

          {/* Trend chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Revenue vs COGS</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                  No completed consultations in this period.
                </div>
              ) : (
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis
                        yAxisId="left"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickFormatter={(v) => `RM ${v}`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 100]}
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) =>
                          name === 'Margin' ? `${value.toFixed(1)}%` : formatRM(value)
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar yAxisId="left" dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="COGS" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Margin"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Profit Leaders */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Profit Leaders</CardTitle>
              </CardHeader>
              <CardContent>
                {topItems.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No items to rank.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">COGS</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topItems.map((item) => (
                        <TableRow key={item.itemName}>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatRM(item.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatRM(item.cogs)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-foreground">
                            {formatRM(item.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* LTV Segment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit by Segment (LTV)</CardTitle>
              </CardHeader>
              <CardContent>
                {ltvSegment.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
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
                            contentStyle={{
                              background: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px',
                              fontSize: '12px',
                            }}
                            formatter={(value: number) => formatRM(value)}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {ltvSegment.map((seg, index) => (
                        <div
                          key={seg.segment}
                          className="border rounded-md p-3 bg-muted/30"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                background: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                              }}
                            />
                            <span className="text-sm font-medium">{seg.segment}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {seg.patientCount} patient{seg.patientCount === 1 ? '' : 's'}
                          </div>
                          <div className="text-sm font-semibold text-foreground mt-1">
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

        <TabsContent value="scoreboards">
          <ScoreboardsTab startDate={startDate} endDate={endDate} />
        </TabsContent>

        <TabsContent value="leaderboards">
          <LeaderboardsTab startDate={startDate} endDate={endDate} />
        </TabsContent>

        <TabsContent value="valuation">
          <ValuationTab startDate={startDate} endDate={endDate} />
        </TabsContent>

        <TabsContent value="health">
          <BankHealthTab startDate={startDate} endDate={endDate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function InsightSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
