import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Search, Phone, AlertCircle } from 'lucide-react';
import { format, differenceInYears, differenceInMonths, differenceInDays } from 'date-fns';
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
import { useConsultationQueueEntries, useCallPatient } from '@/hooks/clinic/useQueueEntries';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';
import { useAuth } from '@/contexts/AuthContext';
import type { ClinicStatus } from '@/types/clinic';

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
      <div className="space-y-5 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (doctorError || queueError) {
    return (
      <div className="space-y-5 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold">Consultation</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load data:{' '}
            {(doctorError as Error)?.message || (queueError as Error)?.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!doctor && !isAdmin) {
    return (
      <div className="space-y-5 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold">Consultation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            You are not registered as a doctor.
          </p>
        </div>
      </div>
    );
  }

  const totalPatients = baseEntries.length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {doctor && (
            <Avatar className="h-9 w-9">
              <AvatarImage src={doctor.avatar_url ?? undefined} />
              <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="text-2xl font-semibold">Consultation</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {totalPatients} patient{totalPatients !== 1 ? 's' : ''} total
              {isAdminFallback && ' (admin view)'}
              {!doctor && isAdmin && ' (admin view — all doctors)'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowSearch(!showSearch)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {showSearch && (
        <Input
          placeholder="Search patient name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          autoFocus
        />
      )}

      {isAdminFallback && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No patients assigned to your doctor profile. Showing all consultation patients.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="waiting">Waiting ({tabCounts.waiting})</TabsTrigger>
          <TabsTrigger value="serving">Serving ({tabCounts.serving})</TabsTrigger>
          <TabsTrigger value="on_hold">On hold ({tabCounts.on_hold})</TabsTrigger>
          <TabsTrigger value="dispensary">Dispensary ({tabCounts.dispensary})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({tabCounts.completed})</TabsTrigger>
          <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead className="w-16">Queue</TableHead>
              <TableHead>Arrive at</TableHead>
              <TableHead>Visit notes</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium">No patients in this tab</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry, i) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium">{entry.patients?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatAge(entry.patients?.date_of_birth)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {entry.queue_number ?? i + 1}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(entry.created_at), 'dd/MM/yy HH:mm')}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
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
                        <span className="text-sm">{entry.doctors.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.payment_method ? entry.payment_method.split(':').pop() : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    ⏱ {Math.round((Date.now() - new Date(entry.created_at).getTime()) / 60000)} mins
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.clinic_status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/clinic/consultation/${entry.id}`)}
                      >
                        View
                      </Button>
                      {doctor &&
                        ['registered', 'ready_for_doctor'].includes(entry.clinic_status) && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1"
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
  );
}
