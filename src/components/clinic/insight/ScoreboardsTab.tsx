import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Inbox } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  chartGridStroke,
  chartAxisStroke,
  chartTickFill,
  chartTooltipStyle,
  chartColors,
} from '@/lib/clinic/bentoTokens';

import { useScoreboards } from '@/hooks/clinic/useScoreboards';

interface Props {
  startDate: Date;
  endDate: Date;
}

function formatRM(value: number) {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function marginColorClass(margin: number) {
  if (margin >= 40) return 'text-emerald-600 font-semibold';
  if (margin >= 20) return 'text-amber-600 font-semibold';
  return 'text-rose-600 font-semibold';
}

const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const TR = 'border-slate-100';

export function ScoreboardsTab({ startDate, endDate }: Props) {
  const { data, isLoading, isError, error } = useScoreboards(startDate, endDate);

  const diagnosesChartData = useMemo(
    () =>
      (data?.topDiagnoses ?? []).map((d) => ({
        name: d.diagnosisName,
        Encounters: d.encounters,
      })),
    [data?.topDiagnoses],
  );

  const medicationsChartData = useMemo(
    () =>
      (data?.topMedications ?? []).map((m) => ({
        name: m.itemName,
        Revenue: Number(m.totalRevenue.toFixed(2)),
      })),
    [data?.topMedications],
  );

  if (isError) {
    return (
      <Card className={bento}>
        <CardContent className="py-6 text-sm text-rose-600">
          Failed to load scoreboards: {(error as Error)?.message ?? 'Unknown error'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ScoreboardsSkeleton />;
  }

  const hasData =
    (data?.doctors.length ?? 0) > 0 ||
    (data?.topDiagnoses.length ?? 0) > 0 ||
    (data?.topMedications.length ?? 0) > 0 ||
    (data?.procedureRoi.length ?? 0) > 0;

  if (!hasData) {
    return (
      <Card className={bento}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-2xl bg-blue-50 p-4 mb-3">
            <Inbox className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No scoreboard data</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            No completed consultations were recorded in the selected date range.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Doctor Performance */}
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Doctor Performance</h3>
            <p className="text-xs text-slate-500">
              Revenue per Patient = Σ Revenue / Unique Patients · Sorted by efficiency.
            </p>
          </div>
          {data!.doctors.length === 0 ? (
            <EmptyMini label="No doctor activity in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent')}>
                  <TableHead className={TH}>Doctor</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Patients</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Revenue</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Revenue / Patient</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.doctors.map((d) => (
                  <TableRow key={d.doctorId ?? `unassigned-${d.doctorName}`} className={TR}>
                    <TableCell
                      className={cn(
                        'font-medium text-slate-800',
                        d.doctorId === null && 'text-slate-400 italic',
                      )}
                    >
                      {d.doctorName}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">{d.uniquePatients}</TableCell>
                    <TableCell className="text-right text-slate-500">
                      {formatRM(d.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatRM(d.revenuePerPatient)}
                    </TableCell>
                    <TableCell className={cn('text-right', marginColorClass(d.marginPct))}>
                      {d.marginPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 2. Top Diagnoses + Top Medications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={bento}>
          <CardContent className="p-6">
            <div className="mb-3">
              <h3 className={cn(bentoHeader, 'mb-1')}>Top 10 Diagnoses</h3>
              <p className="text-xs text-slate-500">By encounters</p>
            </div>
            {diagnosesChartData.length === 0 ? (
              <EmptyMini label="No diagnoses recorded." />
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={diagnosesChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridStroke} />
                    <XAxis type="number" stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={chartAxisStroke}
                      tick={{ fill: chartTickFill }}
                      fontSize={11}
                      width={140}
                      tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="Encounters" fill={chartColors.blue} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={bento}>
          <CardContent className="p-6">
            <div className="mb-3">
              <h3 className={cn(bentoHeader, 'mb-1')}>Top 10 Medications</h3>
              <p className="text-xs text-slate-500">By revenue</p>
            </div>
            {medicationsChartData.length === 0 ? (
              <EmptyMini label="No medications dispensed." />
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={medicationsChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridStroke} />
                    <XAxis
                      type="number"
                      stroke={chartAxisStroke}
                      tick={{ fill: chartTickFill }}
                      fontSize={11}
                      tickFormatter={(v) => `RM ${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={chartAxisStroke}
                      tick={{ fill: chartTickFill }}
                      fontSize={11}
                      width={140}
                      tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number) => formatRM(value)}
                    />
                    <Bar dataKey="Revenue" fill={chartColors.emerald} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Procedure ROI */}
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Procedure ROI</h3>
            <p className="text-xs text-slate-500">
              Gross Margin % = (Revenue − COGS) / Revenue × 100 · Sorted by margin.
            </p>
          </div>
          {data!.procedureRoi.length === 0 ? (
            <EmptyMini label="No procedures performed in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent')}>
                  <TableHead className={TH}>Procedure</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Count</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Revenue</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.procedureRoi.map((p) => (
                  <TableRow key={p.itemName} className={TR}>
                    <TableCell className="font-medium text-slate-800">{p.itemName}</TableCell>
                    <TableCell className="text-right text-slate-600">{p.count}</TableCell>
                    <TableCell className="text-right text-slate-500">
                      {formatRM(p.totalRevenue)}
                    </TableCell>
                    <TableCell className={cn('text-right', marginColorClass(p.marginPct))}>
                      {p.marginPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  );
}

function ScoreboardsSkeleton() {
  return (
    <div className="space-y-4">
      <Card className={bento}>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className={bento}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-[360px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className={bento}>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
