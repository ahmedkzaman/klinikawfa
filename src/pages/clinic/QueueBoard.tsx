import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ListOrdered,
  Plus,
  RotateCcw,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useCancelledTodayEntries,
  useQueueEntries,
  useRestoreQueueEntry,
  useUpdateQueueEntry,
} from '@/hooks/clinic/useQueueEntries';
import { useTodayAppointments } from '@/hooks/clinic/useTodayAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { CheckInAppointmentDialog } from '@/components/clinic/CheckInAppointmentDialog';
import { CheckInWalkInDialog } from '@/components/clinic/CheckInWalkInDialog';
import { RegisterAndCheckInDialog } from '@/components/clinic/RegisterAndCheckInDialog';
import { VitalsEntryDialog } from '@/components/clinic/VitalsEntryDialog';
import { CancelQueueEntryDialog } from '@/components/clinic/CancelQueueEntryDialog';
import {
  QUEUE_COLUMNS,
  STATUS_COLORS,
  STATUS_LABELS,
  type ClinicStatus,
  type QueueEntryWithJoins,
} from '@/types/clinic';
import { cn } from '@/lib/utils';
import { toMalayTitleCase } from '@/lib/textCase';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  primaryBtn,
  secondaryBtn,
  softBadge,
} from '@/lib/clinic/bentoTokens';

function useTickEveryMinute() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function QueueCard({
  entry,
  onClick,
}: {
  entry: QueueEntryWithJoins;
  onClick: () => void;
}) {
  const status = entry.clinic_status as ClinicStatus;
  const waited = formatDistanceToNowStrict(new Date(entry.created_at), { addSuffix: false });

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'w-full text-left bg-white rounded-xl p-3 border border-transparent shadow-[0_2px_8px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgb(0,0,0,0.08)] hover:border-blue-200 transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-2xl font-semibold text-slate-800 leading-none">
          {entry.queue_number ?? '—'}
        </span>
        {entry.is_urgent && (
          <span
            className="h-2 w-2 rounded-full bg-rose-500 mt-1"
            aria-label="Urgent"
            title="Urgent"
          />
        )}
      </div>
      <p className="font-medium text-sm text-slate-800 truncate">
        {entry.patients?.name ? toMalayTitleCase(entry.patients.name) : 'Unknown patient'}
      </p>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
            STATUS_COLORS[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs text-slate-400 tabular-nums">{waited}</span>
      </div>
      {entry.insurance_providers?.name && (
        <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-normal bg-blue-50 text-blue-700">
          Panel · {entry.insurance_providers.name}
        </span>
      )}
      {entry.doctors?.name && (
        <p className="text-xs text-slate-500 mt-1 truncate">Dr. {entry.doctors.name}</p>
      )}
    </motion.button>
  );
}

export default function QueueBoard() {
  useTickEveryMinute();
  const { data: entries = [], isLoading } = useQueueEntries();
  const { data: appointments = [] } = useTodayAppointments();
  const { data: cancelledToday = [] } = useCancelledTodayEntries();
  const updateQueue = useUpdateQueueEntry();
  const restoreEntry = useRestoreQueueEntry();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [appointmentDialog, setAppointmentDialog] = useState(false);
  const [walkInDialog, setWalkInDialog] = useState(false);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithJoins | null>(null);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const ACTIVE_STATUSES: ClinicStatus[] = [
    'registered',
    'ready_for_doctor',
    'with_doctor',
    'sent_to_dispensary',
    'dispensing_payment',
    'on_hold',
  ];

  const visibleEntries = useMemo(
    () => entries.filter((e) => ACTIVE_STATUSES.includes(e.clinic_status as ClinicStatus)),
    [entries],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, QueueEntryWithJoins[]>();
    QUEUE_COLUMNS.forEach((c) => map.set(c.key, []));
    visibleEntries.forEach((e) => {
      const status = e.clinic_status as ClinicStatus;
      const col = QUEUE_COLUMNS.find((c) => c.statuses.includes(status));
      if (col) map.get(col.key)!.push(e);
    });
    return map;
  }, [visibleEntries]);

  const totalActive = visibleEntries.length;

  return (
    <>
      <SEOHead
        title="Queue Board — Clinic Portal"
        description="Live queue board for active patients."
        noIndex
      />

      <div className={pageShell}>
        <div className={pageInner}>
          {/* Header bar */}
          <div className={cn(bento, 'p-4 flex items-center justify-between gap-3 flex-wrap')}>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">Queue Board</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {format(new Date(), 'EEEE, d MMMM yyyy')} · {totalActive} active
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="ghost"
                onClick={() => setWalkInDialog(true)}
                className={secondaryBtn}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Walk-In
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRegisterDialog(true)}
                className={secondaryBtn}
              >
                <Users className="h-4 w-4 mr-1" /> Register & Queue
              </Button>
              <Button
                onClick={() => setAppointmentDialog(true)}
                disabled={appointments.length === 0}
                title={appointments.length === 0 ? 'No pending appointments today' : undefined}
                className={primaryBtn}
              >
                <Plus className="h-4 w-4 mr-1" /> Check In Appointment
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-2xl" />
              ))}
            </div>
          ) : totalActive === 0 ? (
            <div className={cn(bento, 'flex flex-col items-center gap-3 py-16 text-center')}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <ListOrdered className="h-7 w-7 text-blue-600" />
              </div>
              <p className="text-sm text-slate-500 max-w-sm">
                No active patients. Check in an appointment or walk-in to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {QUEUE_COLUMNS.map((col) => {
                const items = grouped.get(col.key) ?? [];
                return (
                  <div
                    key={col.key}
                    className={cn(bento, 'p-3 flex flex-col min-h-[180px]')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        {col.label}
                      </h2>
                      <span
                        className={cn(softBadge, 'inline-flex items-center px-2 py-0.5 text-xs tabular-nums')}
                      >
                        {items.length}
                      </span>
                    </div>
                    {col.key === 'registered' ? (
                      <p className="text-[11px] text-slate-400 mb-2">Awaiting triage</p>
                    ) : (
                      <div className="mb-2" />
                    )}
                    <div className="space-y-2 flex-1">
                      <AnimatePresence mode="popLayout">
                        {items.length === 0 && (
                          <motion.p
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-xs text-slate-400 text-center py-4"
                          >
                            Empty
                          </motion.p>
                        )}
                        {items.map((entry) => (
                          <QueueCard
                            key={entry.id}
                            entry={entry}
                            onClick={() => setActiveEntry(entry)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recently Cancelled (today) — audit drawer */}
          <Collapsible className="mt-8 w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
            <CollapsibleTrigger className="group flex w-full items-center justify-between p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Recently Cancelled Today
                </span>
                <span className={cn(softBadge, 'inline-flex items-center px-2 py-0.5 text-xs tabular-nums')}>
                  {cancelledToday.length}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/40">
              {cancelledToday.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  No cancelled visits today.
                </p>
              ) : (
                cancelledToday.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border border-slate-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        <span className="font-mono text-slate-500 mr-1.5">#{c.queue_number ?? '—'}</span>
                        {c.patients?.name ? toMalayTitleCase(c.patients.name) : 'Unknown patient'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {c.cancelled_at ? format(new Date(c.cancelled_at), 'HH:mm') : '—'} ·{' '}
                        {c.cancellation_reason ?? '—'}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        disabled={restoreEntry.isPending}
                        onClick={() =>
                          restoreEntry.mutate({ id: c.id, existingNotes: c.visit_notes })
                        }
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet open={!!activeEntry} onOpenChange={(o) => !o && setActiveEntry(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-slate-50">
          <SheetHeader>
            <SheetTitle className="text-slate-800">
              Queue #{activeEntry?.queue_number ?? '—'}
              {activeEntry?.is_urgent && (
                <span className="ml-2 inline-flex items-center gap-1 text-rose-600 text-sm font-normal">
                  <AlertCircle className="h-4 w-4" /> Urgent
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-slate-500">
              {activeEntry?.patients?.name ? toMalayTitleCase(activeEntry.patients.name) : 'Unknown patient'}
            </SheetDescription>
          </SheetHeader>

          {activeEntry && (
            <div className={cn(bento, 'mt-6 p-5 space-y-4 text-sm')}>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status</p>
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    STATUS_COLORS[activeEntry.clinic_status as ClinicStatus],
                  )}
                >
                  {STATUS_LABELS[activeEntry.clinic_status as ClinicStatus]}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-slate-800">{activeEntry.patients?.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                  Visit purpose
                </p>
                <p className="text-slate-800 capitalize">
                  {activeEntry.visit_purpose.replace(/_/g, ' ')}
                </p>
              </div>
              {activeEntry.visit_notes && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-slate-800 whitespace-pre-wrap">{activeEntry.visit_notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Created</p>
                <p className="text-slate-800">
                  {format(new Date(activeEntry.created_at), 'd MMM yyyy, HH:mm')}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                {activeEntry.clinic_status === 'registered' && (
                  <>
                    <Button
                      className={primaryBtn}
                      disabled={updateQueue.isPending}
                      onClick={() => setVitalsOpen(true)}
                    >
                      <Activity className="h-4 w-4 mr-2" />
                      Take Vitals / Triage
                    </Button>
                    <Button
                      variant="ghost"
                      className={secondaryBtn}
                      disabled={updateQueue.isPending}
                      onClick={() => {
                        if (!activeEntry) return;
                        updateQueue.mutate(
                          { id: activeEntry.id, clinic_status: 'ready_for_doctor' },
                          {
                            onSuccess: () => {
                              setActiveEntry(null);
                              toast.success('Patient sent to doctor');
                            },
                            onError: (error: unknown) => {
                              const message =
                                error instanceof Error ? error.message : 'Unknown error';
                              toast.error(`Update failed: ${message}`);
                            },
                          },
                        );
                      }}
                    >
                      Skip Triage → Send to Doctor
                    </Button>
                  </>
                )}

                {(activeEntry.clinic_status === 'sent_to_dispensary' ||
                  activeEntry.clinic_status === 'dispensing_payment') && (
                  <Button
                    variant="ghost"
                    className={secondaryBtn}
                    onClick={() => {
                      if (!activeEntry) return;
                      navigate(`/clinic/queue/checkout/${activeEntry.id}`);
                      setActiveEntry(null);
                    }}
                  >
                    Open Checkout
                  </Button>
                )}

                {activeEntry.clinic_status === 'on_hold' && (
                  <p className="text-sm text-slate-500 italic">
                    Patient is on hold. Status can only be resumed by the attending doctor.
                  </p>
                )}

                {(['registered', 'ready_for_doctor', 'with_doctor', 'on_hold'] as ClinicStatus[]).includes(
                  activeEntry.clinic_status as ClinicStatus,
                ) && (
                  <div className="mt-2 pt-3 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      className="w-full text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => setCancelOpen(true)}
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Patient Absconded / Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <CheckInAppointmentDialog
        open={appointmentDialog}
        onOpenChange={setAppointmentDialog}
      />
      <CheckInWalkInDialog open={walkInDialog} onOpenChange={setWalkInDialog} />
      <RegisterAndCheckInDialog open={registerDialog} onOpenChange={setRegisterDialog} />

      {activeEntry && (
        <>
          <VitalsEntryDialog
            open={vitalsOpen}
            onOpenChange={(o) => {
              setVitalsOpen(o);
              if (!o && !cancelOpen) setActiveEntry(null);
            }}
            queueEntryId={activeEntry.id}
            patientId={activeEntry.patient_id}
          />
          <CancelQueueEntryDialog
            open={cancelOpen}
            onOpenChange={(o) => {
              setCancelOpen(o);
              if (!o) setActiveEntry(null);
            }}
            entry={activeEntry}
          />
        </>
      )}
    </>
  );
}
