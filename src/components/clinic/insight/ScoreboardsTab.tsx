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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  return 'text-red-600 font-semibold';
}

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
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
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
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold text-foreground">No scoreboard data</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            No completed consultations were recorded in the selected date range.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Doctor Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doctor Performance</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Revenue per Patient = Σ Revenue / Unique Patients · Sorted by efficiency.
          </p>
        </CardHeader>
        <CardContent>
          {data!.doctors.length === 0 ? (
            <EmptyMini label="No doctor activity in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doctor</TableHead>
                  <TableHead className="text-right">Patients</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Revenue / Patient</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.doctors.map((d) => (
                  <TableRow key={d.doctorId ?? `unassigned-${d.doctorName}`}>
                    <TableCell
                      className={cn(
                        'font-medium',
                        d.doctorId === null && 'text-muted-foreground italic',
                      )}
                    >
                      {d.doctorName}
                    </TableCell>
                    <TableCell className="text-right">{d.uniquePatients}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatRM(d.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Diagnoses</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">By encounters</p>
          </CardHeader>
          <CardContent>
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={140}
                      tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="Encounters"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Medications</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">By revenue</p>
          </CardHeader>
          <CardContent>
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickFormatter={(v) => `RM ${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={140}
                      tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => formatRM(value)}
                    />
                    <Bar dataKey="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Procedure ROI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Procedure ROI</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Gross Margin % = (Revenue − COGS) / Revenue × 100 · Sorted by margin.
          </p>
        </CardHeader>
        <CardContent>
          {data!.procedureRoi.length === 0 ? (
            <EmptyMini label="No procedures performed in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedure</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.procedureRoi.map((p) => (
                  <TableRow key={p.itemName}>
                    <TableCell className="font-medium">{p.itemName}</TableCell>
                    <TableCell className="text-right">{p.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
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
    <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ScoreboardsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[360px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
