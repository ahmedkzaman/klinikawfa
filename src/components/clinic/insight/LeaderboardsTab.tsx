import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Inbox, Users, Wallet, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
import { supabase } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';
import { usePatientLTV } from '@/hooks/clinic/usePatientLTV';
import { useScoreboards } from '@/hooks/clinic/useScoreboards';
import { PatientProfileSheet } from '@/components/patients/PatientProfileSheet';
import type { PatientRow } from '@/types/clinic';

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

/** One-shot fetch of a single patient row. Used to feed PatientProfileSheet. */
function usePatientById(patientId: string | null) {
  return useQuery({
    queryKey: ['patient', patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId!)
        .maybeSingle();
      if (error) throw error;
      return data as PatientRow | null;
    },
  });
}

export function LeaderboardsTab({ startDate, endDate }: Props) {
  const { isAdmin, isDoctorAdmin } = useAuth();
  const { data: currentDoctor } = useCurrentDoctor();

  // Clinical-record clickability: doctor_admin OR any user linked to a doctors row.
  // Pure admin (non-clinical) sees the radar but cannot drill into medical records.
  const canClickToHistory = isDoctorAdmin || !!currentDoctor;

  const {
    data: ltvData,
    isLoading: ltvLoading,
    isError: ltvError,
    error: ltvErrorObj,
  } = usePatientLTV();

  const {
    data: scoreData,
    isLoading: scoreLoading,
    isError: scoreError,
    error: scoreErrorObj,
  } = useScoreboards(startDate, endDate);

  const sortedDoctors = useMemo(
    () =>
      (scoreData?.doctors ?? [])
        .slice()
        .sort((a, b) => b.totalProfit - a.totalProfit),
    [scoreData?.doctors],
  );

  const cacCeiling = (ltvData?.medianLTV ?? 0) * 0.3;

  // VIP Radar → PatientProfileSheet bridge
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const { data: openPatient } = usePatientById(openPatientId);

  return (
    <div className="space-y-6">
      {/* Top row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LTV Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Patient LTV Distribution</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Excludes patients with no visits in &gt; 3 years.
            </p>
          </CardHeader>
          <CardContent>
            {ltvError ? (
              <div className="py-6 text-sm text-destructive">
                Failed to load LTV: {(ltvErrorObj as Error)?.message ?? 'Unknown error'}
              </div>
            ) : ltvLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (ltvData?.activeCount ?? 0) === 0 ? (
              <EmptyMini
                icon={<Inbox className="h-8 w-8 text-muted-foreground mb-2" />}
                label="No active patient history available yet."
              />
            ) : (
              <>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ltvData!.histogramData}
                      margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value} patient${value === 1 ? '' : 's'}`, 'Count']}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {ltvData!.activeCount} active patient{ltvData!.activeCount === 1 ? '' : 's'} ·{' '}
                  {ltvData!.inactiveCount} excluded as inactive
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Acquisition Strategy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acquisition Strategy</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              CAC budget anchored to active-patient median LTV.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {ltvLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-28 w-full" />
              </>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Median Active LTV
                    </span>
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatRM(ltvData?.medianLTV ?? 0)}
                  </div>
                </div>

                <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
                  <div className="flex items-center justify-between text-primary mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Recommended CAC Ceiling (30%)
                    </span>
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatRM(cacCeiling)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    To maintain sustainable unit economics, do not spend more than this amount
                    to acquire a single new patient.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VIP Patient Radar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">VIP Patient Radar</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Top 50 active patients by lifetime revenue.
            {!canClickToHistory && (
              <span className="ml-1 italic">
                Reg. No is read-only — clinical access required to view records.
              </span>
            )}
          </p>
        </CardHeader>
        <CardContent>
          {ltvLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (ltvData?.top50.length ?? 0) === 0 ? (
            <EmptyMini
              icon={<Inbox className="h-8 w-8 text-muted-foreground mb-2" />}
              label="No active patients to rank."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Reg. No</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Total LTV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ltvData!.top50.map((p, idx) => (
                  <TableRow key={p.patient_id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{idx + 1}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {canClickToHistory ? (
                        <button
                          type="button"
                          onClick={() => setOpenPatientId(p.patient_id)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {p.reg_no ?? '—'}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span>{p.reg_no ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.visitCount}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {formatRM(p.totalRevenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Doctor Efficiency Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doctor Efficiency Leaderboard</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Ranked by Gross Profit (Revenue − COGS) for the selected period.
          </p>
        </CardHeader>
        <CardContent>
          {scoreError ? (
            <div className="py-6 text-sm text-destructive">
              Failed to load doctor leaderboard:{' '}
              {(scoreErrorObj as Error)?.message ?? 'Unknown error'}
            </div>
          ) : scoreLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : sortedDoctors.length === 0 ? (
            <EmptyMini
              icon={<Inbox className="h-8 w-8 text-muted-foreground mb-2" />}
              label="No doctor performance data for this period."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doctor</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDoctors.map((d) => (
                  <TableRow key={d.doctorId ?? `unassigned-${d.doctorName}`}>
                    <TableCell
                      className={cn(
                        'font-medium',
                        d.doctorId === null && 'text-muted-foreground italic',
                      )}
                    >
                      {d.doctorName}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatRM(d.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">
                      {formatRM(d.totalProfit)}
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

      {/* Patient profile sheet — shared by all VIP rows */}
      <PatientProfileSheet
        patient={openPatient ?? null}
        isOpen={!!openPatientId && !!openPatient}
        onClose={() => setOpenPatientId(null)}
        onRegisterVisit={() => {
          // Register-visit is a UX shortcut from the patients list; on the
          // insight dashboard we just close the sheet — the user can navigate
          // to the patients page if they need to register a fresh visit.
          setOpenPatientId(null);
        }}
      />

      {/* Suppress unused-var warning when isAdmin is gated upstream by route guard */}
      {void isAdmin}
    </div>
  );
}

function EmptyMini({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center text-sm text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}
