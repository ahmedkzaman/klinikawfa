import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
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
import { CalendarIcon, TrendingUp, Wallet, Percent, Users, Loader2 } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { useFinancialInsights } from '@/hooks/clinic/useFinancialInsights';

const SEGMENT_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))'];

function formatRM(value: number) {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Insight() {
  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const startDate = range?.from ?? subDays(new Date(), 29);
  const endDate = range?.to ?? new Date();

  const { data, isLoading, isError, error } = useFinancialInsights(startDate, endDate);

  const summary = data?.summary;
  const dailyTrends = data?.dailyTrends ?? [];
  const topItems = data?.topItems ?? [];
  const ltvSegment = data?.ltvSegment ?? [];

  const chartData = useMemo(
    () =>
      dailyTrends.map((d) => ({
        date: format(new Date(d.date), 'd MMM'),
        Revenue: Number(d.revenue.toFixed(2)),
        Profit: Number(d.profit.toFixed(2)),
      })),
    [dailyTrends],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Financial Insights</h1>
          <p className="text-sm text-muted-foreground">
            Revenue, profit & margin analytics across consultations.
          </p>
        </div>

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
              onSelect={setRange}
              numberOfMonths={2}
              defaultMonth={range?.from}
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Failed to load insights: {(error as Error)?.message ?? 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total Revenue"
          value={summary ? formatRM(summary.totalRevenue) : '—'}
          loading={isLoading}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total Profit"
          value={summary ? formatRM(summary.totalProfit) : '—'}
          loading={isLoading}
        />
        <SummaryCard
          icon={<Percent className="h-4 w-4" />}
          label="Overall Margin"
          value={summary ? `${summary.marginPct.toFixed(1)}%` : '—'}
          loading={isLoading}
        />
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Patient Volume"
          value={summary ? summary.patientVolume.toLocaleString() : '—'}
          loading={isLoading}
        />
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Revenue vs Profit</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[320px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              No completed consultations in this period.
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
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
                  <Bar dataKey="Revenue" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="Profit"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
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
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : topItems.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No items to rank.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
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
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : ltvSegment.length === 0 ? (
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
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-semibold text-foreground">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}
