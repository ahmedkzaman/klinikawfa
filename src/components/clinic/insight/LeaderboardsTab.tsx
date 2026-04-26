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
import { supabase } from '@/integrations/supabase/client';
import {
  bento,
  bentoHeader,
  softTile,
  chartGridStroke,
  chartAxisStroke,
  chartTickFill,
  chartTooltipStyle,
  chartColors,
} from '@/lib/clinic/bentoTokens';

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
  return 'text-rose-600 font-semibold';
}

const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const TR = 'border-slate-100';

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
  const { isDoctorAdmin } = useAuth();
  const { data: currentDoctor } = useCurrentDoctor();

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

  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const { data: openPatient } = usePatientById(openPatientId);

  return (
    <div className="space-y-4">
      {/* Top row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LTV Distribution */}
        <Card className={bento}>
          <CardContent className="p-6">
            <div className="mb-3">
              <h3 className={cn(bentoHeader, 'mb-1')}>Active Patient LTV Distribution</h3>
              <p className="text-xs text-slate-500">
                Excludes patients with no visits in &gt; 3 years.
              </p>
            </div>
            {ltvError ? (
              <div className="py-6 text-sm text-rose-600">
                Failed to load LTV: {(ltvErrorObj as Error)?.message ?? 'Unknown error'}
              </div>
            ) : ltvLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (ltvData?.activeCount ?? 0) === 0 ? (
              <EmptyMini
                icon={<Inbox className="h-8 w-8 text-slate-300 mb-2" />}
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
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                      <XAxis dataKey="name" stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={11} />
                      <YAxis stroke={chartAxisStroke} tick={{ fill: chartTickFill }} fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value: number) => [`${value} patient${value === 1 ? '' : 's'}`, 'Count']}
                      />
                      <Bar dataKey="count" fill={chartColors.emerald} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  {ltvData!.activeCount} active patient{ltvData!.activeCount === 1 ? '' : 's'} ·{' '}
                  {ltvData!.inactiveCount} excluded as inactive
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Acquisition Strategy */}
        <Card className={bento}>
          <CardContent className="p-6">
            <div className="mb-3">
              <h3 className={cn(bentoHeader, 'mb-1')}>Acquisition Strategy</h3>
              <p className="text-xs text-slate-500">
                CAC budget anchored to active-patient median LTV.
              </p>
            </div>
            {ltvLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className={softTile}>
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Median Active LTV
                    </span>
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatRM(ltvData?.medianLTV ?? 0)}
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 border-l-4 border-blue-600 p-4">
                  <div className="flex items-center justify-between text-blue-700 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Recommended CAC Ceiling (30%)
                    </span>
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatRM(cacCeiling)}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    To maintain sustainable unit economics, do not spend more than this amount
                    to acquire a single new patient.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VIP Patient Radar */}
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>VIP Patient Radar</h3>
            <p className="text-xs text-slate-500">
              Top 50 active patients by lifetime revenue.
              {!canClickToHistory && (
                <span className="ml-1 italic">
                  Reg. No is read-only — clinical access required to view records.
                </span>
              )}
            </p>
          </div>
          {ltvLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (ltvData?.top50.length ?? 0) === 0 ? (
            <EmptyMini
              icon={<Inbox className="h-8 w-8 text-slate-300 mb-2" />}
              label="No active patients to rank."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent')}>
                  <TableHead className={cn(TH, 'w-12')}>Rank</TableHead>
                  <TableHead className={TH}>Reg. No</TableHead>
                  <TableHead className={TH}>Primary Condition</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Visits</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Total LTV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ltvData!.top50.map((p, idx) => (
                  <TableRow key={p.patient_id} className={TR}>
                    <TableCell className="font-mono text-xs text-slate-400">
                      #{idx + 1}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {canClickToHistory ? (
                        <button
                          type="button"
                          onClick={() => setOpenPatientId(p.patient_id)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          {p.reg_no ?? '—'}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="text-slate-700">{p.reg_no ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500 italic text-sm">
                      {p.primary_diagnosis}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">{p.visitCount}</TableCell>
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
      <Card className={bento}>
        <CardContent className="p-6">
          <div className="mb-3">
            <h3 className={cn(bentoHeader, 'mb-1')}>Doctor Efficiency Leaderboard</h3>
            <p className="text-xs text-slate-500">
              Ranked by Gross Profit (Revenue − COGS) for the selected period.
            </p>
          </div>
          {scoreError ? (
            <div className="py-6 text-sm text-rose-600">
              Failed to load doctor leaderboard:{' '}
              {(scoreErrorObj as Error)?.message ?? 'Unknown error'}
            </div>
          ) : scoreLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : sortedDoctors.length === 0 ? (
            <EmptyMini
              icon={<Inbox className="h-8 w-8 text-slate-300 mb-2" />}
              label="No doctor performance data for this period."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent')}>
                  <TableHead className={TH}>Doctor</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Revenue</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Gross Profit</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDoctors.map((d) => (
                  <TableRow key={d.doctorId ?? `unassigned-${d.doctorName}`} className={TR}>
                    <TableCell
                      className={cn(
                        'font-medium text-slate-800',
                        d.doctorId === null && 'text-slate-400 italic',
                      )}
                    >
                      {d.doctorName}
                    </TableCell>
                    <TableCell className="text-right text-slate-500">
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
          setOpenPatientId(null);
        }}
      />
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
    <div className="flex h-[200px] flex-col items-center justify-center text-sm text-slate-400">
      {icon}
      {label}
    </div>
  );
}
