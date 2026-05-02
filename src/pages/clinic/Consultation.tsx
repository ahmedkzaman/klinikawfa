import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Search, Phone, AlertCircle } from 'lucide-react';
import { format, differenceInYears, differenceInMonths, differenceInDays } from 'date-fns';
import { RoomPickerDialog } from '@/components/clinic/consultation/RoomPickerDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import {
  useConsultationQueueEntries,
  useCallPatient,
  useUpdateQueueEntry,
} from '@/hooks/clinic/useQueueEntries';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { ClinicStatus } from '@/types/clinic';
import { cn } from '@/lib/utils';
import {
  bento,
  pageInner,
  pageShell,
  pillTabActive,
  pillTabIdle,
  primaryBtn,
  secondaryBtn,
  softInput,
} from '@/lib/clinic/bentoTokens';

const TAB_KEYS = ['waiting', 'serving', 'on_hold', 'dispensary', 'completed', 'all'] as const;

const TAB_STATUSES: Record<string, ClinicStatus[]> = {
  waiting: ['registered', 'ready_for_doctor'],
  serving: ['with_doctor'],
  on_hold: ['on_hold'],
  dispensary: ['sent_to_dispensary', 'dispensing_payment'],
  completed: ['completed'],
  all: [],
};

function formatAge(dob: string | null | undefined) {
  if (!dob) return '—';
  const d = new Date(dob);
  const now = new Date();
  const y = differenceInYears(now, d);
  const m = differenceInMonths(now, d) % 12;
  const dayDate = new Date(d);
  dayDate.setFullYear(dayDate.getFullYear() + y);
  dayDate.setMonth(dayDate.getMonth() + m);
  const dy = differenceInDays(now, dayDate);
  return `${y} yr ${m} mo ${dy} d`;
}

export default function Consultation() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: doctor, isLoading: doctorLoading, error: doctorError } = useCurrentDoctor();
  const { data: entries = [], isLoading: queueLoading, error: queueError } =
    useConsultationQueueEntries();
  const callPatient = useCallPatient();
  const resumeQueue = useUpdateQueueEntry();
  const [tab, setTab] = useState('waiting');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [autoSelected, setAutoSelected] = useState(false);

  const allConsultationEntries = useMemo(
    () => entries.filter((e) => e.visit_purpose === 'consultation'),
    [entries],
  );

  const doctorEntries = useMemo(() => {
    if (!doctor) return [];
    return allConsultationEntries.filter((e) => e.assigned_doctor_id === doctor.id);
  }, [allConsultationEntries, doctor]);

  const isAdminFallback =
    isAdmin && doctor && doctorEntries.length === 0 && allConsultationEntries.length > 0;
  const baseEntries = doctor
    ? isAdminFallback
      ? allConsultationEntries
      : doctorEntries
    : isAdmin
      ? allConsultationEntries
      : [];

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of TAB_KEYS) {
      const statuses = TAB_STATUSES[key];
      counts[key] = statuses.length
        ? baseEntries.filter((e) => statuses.includes(e.clinic_status)).length
        : baseEntries.length;
    }
    return counts;
  }, [baseEntries]);

  useEffect(() => {
    if (autoSelected || baseEntries.length === 0) return;
    if (tabCounts[tab] > 0) {
      setAutoSelected(true);
      return;
    }
    const firstNonEmpty = TAB_KEYS.find((k) => tabCounts[k] > 0);
    if (firstNonEmpty) setTab(firstNonEmpty);
    setAutoSelected(true);
  }, [tabCounts, baseEntries.length, autoSelected, tab]);

  const filtered = useMemo(() => {
    let list = [...baseEntries];
    const statuses = TAB_STATUSES[tab];
    if (statuses.length) list = list.filter((e) => statuses.includes(e.clinic_status));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.patients?.name?.toLowerCase().includes(s));
    }
    return list;
  }, [baseEntries, tab, search]);

  if (doctorLoading || queueLoading) {
    return (
      <div className={pageShell}>
        <div className={pageInner}>
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (doctorError || queueError) {
    return (
      <div className={pageShell}>
        <div className={pageInner}>
          <div className={cn(bento, 'p-5')}>
            <h1 className="text-2xl font-semibold text-slate-800">Consultation</h1>
          </div>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load data:{' '}
              {(doctorError as Error)?.message || (queueError as Error)?.message}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!doctor && !isAdmin) {
    return (
      <div className={pageShell}>
        <div className={pageInner}>
          <div className={cn(bento, 'p-5')}>
            <h1 className="text-2xl font-semibold text-slate-800">Consultation</h1>
            <p className="text-slate-500 text-sm mt-1">
              You are not registered as a doctor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalPatients = baseEntries.length;

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        {/* Header bar */}
        <div className={cn(bento, 'p-4 flex items-center justify-between gap-4')}>
          <div className="flex items-center gap-3">
            {doctor && (
              <Avatar className="h-9 w-9">
                <AvatarImage src={doctor.avatar_url ?? undefined} />
                <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">Consultation</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {totalPatients} patient{totalPatients !== 1 ? 's' : ''} total
                {isAdminFallback && ' (admin view)'}
                {!doctor && isAdmin && ' (admin view — all doctors)'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSearch(!showSearch)}
            className="rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {showSearch && (
          <div className={cn(bento, 'p-3')}>
            <Input
              placeholder="Search patient name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(softInput, 'max-w-sm')}
              autoFocus
            />
          </div>
        )}

        {isAdminFallback && (
          <Alert className="rounded-2xl border-blue-200 bg-blue-50/60 text-blue-900">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              No patients assigned to your doctor profile. Showing all consultation patients.
            </AlertDescription>
          </Alert>
        )}

        {/* Pill tabs */}
        <div className={cn(bento, 'p-2')}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-transparent h-auto p-0 flex flex-wrap gap-1">
              {(['waiting', 'serving', 'on_hold', 'dispensary', 'completed', 'all'] as const).map(
                (key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium border-none data-[state=active]:shadow-none transition-colors',
                      'data-[state=active]:' + pillTabActive.replace(/^rounded-full px-3 py-1 text-xs font-medium /, ''),
                      'data-[state=inactive]:' +
                        pillTabIdle.replace(/^rounded-full px-3 py-1 text-xs font-medium /, ''),
                    )}
                  >
                    {key === 'on_hold'
                      ? 'On hold'
                      : key.charAt(0).toUpperCase() + key.slice(1)}{' '}
                    ({tabCounts[key]})
                  </TabsTrigger>
                ),
              )}
            </TabsList>
          </Tabs>
        </div>

        <div className={cn(bento, 'overflow-x-auto')}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Patient
                </TableHead>
                <TableHead className="w-16 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Queue
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Arrive at
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Visit notes
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Doctor
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Payment
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Duration
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Status
                </TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                    <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium text-slate-600">No patients in this tab</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry, i) => (
                  <TableRow key={entry.id} className="border-slate-100 hover:bg-slate-50/60">
                    <TableCell>
                      <div className="font-medium text-slate-800">{entry.patients?.name ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {formatAge(entry.patients?.date_of_birth)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-slate-600">
                      {entry.queue_number ?? i + 1}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {format(new Date(entry.created_at), 'dd/MM/yy HH:mm')}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate text-slate-600">
                      {entry.visit_notes || '—'}
                    </TableCell>
                    <TableCell>
                      {entry.doctors ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={entry.doctors.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {entry.doctors.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-slate-700">{entry.doctors.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {entry.payment_method ? entry.payment_method.split(':').pop() : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      ⏱ {Math.round((Date.now() - new Date(entry.created_at).getTime()) / 60000)} mins
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.clinic_status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {entry.clinic_status === 'on_hold' ? (
                          <Button
                            size="sm"
                            className={primaryBtn}
                            disabled={
                              resumeQueue.isPending && resumeQueue.variables?.id === entry.id
                            }
                            onClick={() =>
                              resumeQueue.mutate(
                                { id: entry.id, clinic_status: 'with_doctor' },
                                {
                                  onSuccess: () => {
                                    toast.success('Patient resumed — back with doctor');
                                    navigate(`/clinic/consultation/${entry.id}`);
                                  },
                                  onError: (error: unknown) => {
                                    const message =
                                      error instanceof Error ? error.message : 'Unknown error';
                                    toast.error(`Resume failed: ${message}`);
                                  },
                                },
                              )
                            }
                          >
                            {resumeQueue.isPending && resumeQueue.variables?.id === entry.id
                              ? 'Resuming…'
                              : 'Resume Patient'}
                          </Button>
                        ) : (['sent_to_dispensary', 'dispensing_payment'] as ClinicStatus[]).includes(
                            entry.clinic_status,
                          ) ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={secondaryBtn}
                              onClick={() => navigate(`/clinic/consultation/${entry.id}`)}
                            >
                              Edit Consultation
                            </Button>
                            <Button
                              size="sm"
                              className={primaryBtn}
                              onClick={() => navigate(`/clinic/queue/checkout/${entry.id}`)}
                            >
                              Checkout
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={secondaryBtn}
                            onClick={() => navigate(`/clinic/consultation/${entry.id}`)}
                          >
                            View
                          </Button>
                        )}
                        {doctor &&
                          ['registered', 'ready_for_doctor'].includes(entry.clinic_status) && (
                            <Button
                              size="sm"
                              className={cn(primaryBtn, 'gap-1')}
                              onClick={() =>
                                callPatient.mutate({
                                  id: entry.id,
                                  called_by_doctor_id: doctor.id,
                                })
                              }
                              disabled={callPatient.isPending}
                            >
                              <Phone className="h-3 w-3" /> Call In
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
