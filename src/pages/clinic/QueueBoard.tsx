import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ListOrdered,
  Plus,
  UserPlus,
  Users,
  Activity,
  UserX,
  ChevronDown,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { SEOHead } from "@/components/seo/SEOHead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useQueueEntries,
  useUpdateQueueEntry,
  useCancelledTodayEntries,
  useRestoreQueueEntry,
} from "@/hooks/clinic/useQueueEntries";
import { useProfile } from "@/hooks/auth/useProfile"; // Assumed hook for locum check
import { useTodayAppointments } from "@/hooks/clinic/useTodayAppointments";
import { CheckInAppointmentDialog } from "@/components/clinic/CheckInAppointmentDialog";
import { CheckInWalkInDialog } from "@/components/clinic/CheckInWalkInDialog";
import { RegisterAndCheckInDialog } from "@/components/clinic/RegisterAndCheckInDialog";
import { VitalsEntryDialog } from "@/components/clinic/VitalsEntryDialog";
import { CancelQueueEntryDialog } from "@/components/clinic/CancelQueueEntryDialog";
import {
  QUEUE_COLUMNS,
  STATUS_COLORS,
  STATUS_LABELS,
  type ClinicStatus,
  type QueueEntryWithJoins,
} from "@/types/clinic";
import { cn } from "@/lib/utils";
import { toMalayTitleCase } from "@/lib/textCase";
import { bento, pageInner, pageShell, primaryBtn, secondaryBtn, softBadge } from "@/lib/clinic/bentoTokens";

function useTickEveryMinute() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function QueueCard({ entry, onClick }: { entry: QueueEntryWithJoins; onClick: () => void }) {
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
        "w-full text-left bg-white rounded-xl p-3 border border-transparent shadow-[0_2px_8px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgb(0,0,0,0.08)] hover:border-blue-200 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-2xl font-semibold text-slate-800 leading-none">
          {entry.queue_number ?? "—"}
        </span>
        {entry.is_urgent && (
          <span className="h-2 w-2 rounded-full bg-rose-500 mt-1" aria-label="Urgent" title="Urgent" />
        )}
      </div>
      <p className="font-medium text-sm text-slate-800 truncate">
        {entry.patients?.name ? toMalayTitleCase(entry.patients.name) : "Unknown patient"}
      </p>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
            STATUS_COLORS[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs text-slate-400 tabular-nums">{waited}</span>
      </div>
    </motion.button>
  );
}

export default function QueueBoard() {
  useTickEveryMinute();
  const { data: entries = [], isLoading } = useQueueEntries();
  const { data: cancelledToday = [] } = useCancelledTodayEntries();
  const { data: appointments = [] } = useTodayAppointments();
  const { data: profile } = useProfile();

  const updateQueue = useUpdateQueueEntry();
  const restoreEntry = useRestoreQueueEntry();
  const navigate = useNavigate();

  const [appointmentDialog, setAppointmentDialog] = useState(false);
  const [walkInDialog, setWalkInDialog] = useState(false);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithJoins | null>(null);

  // Permission Checks
  const isLocum = profile?.position?.toLowerCase() === "locum";
  const isAdmin =
    profile?.position?.toLowerCase() === "admin" || profile?.position?.toLowerCase() === "medical director";

  const ACTIVE_STATUSES: ClinicStatus[] = [
    "registered",
    "ready_for_doctor",
    "with_doctor",
    "sent_to_dispensary",
    "dispensing_payment",
    "on_hold",
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

  return (
    <>
      <SEOHead title="Queue Board — Clinic Portal" noIndex />

      <div className={pageShell}>
        <div className={pageInner}>
          {/* Header bar */}
          <div className={cn(bento, "p-4 flex items-center justify-between gap-3 flex-wrap")}>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">Queue Board</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {format(new Date(), "EEEE, d MMMM yyyy")} · {visibleEntries.length} active
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" onClick={() => setWalkInDialog(true)} className={secondaryBtn} disabled={isLocum}>
                <UserPlus className="h-4 w-4 mr-1" /> Walk-In
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRegisterDialog(true)}
                className={secondaryBtn}
                disabled={isLocum}
              >
                <Users className="h-4 w-4 mr-1" /> Register & Queue
              </Button>
              <Button
                onClick={() => setAppointmentDialog(true)}
                disabled={appointments.length === 0 || isLocum}
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {QUEUE_COLUMNS.map((col) => {
                const items = grouped.get(col.key) ?? [];
                return (
                  <div key={col.key} className={cn(bento, "p-3 flex flex-col min-h-[180px]")}>
                    <div className="mb-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{col.label}</h2>
                        <span className={cn(softBadge, "px-2 py-0.5 text-xs")}>{items.length}</span>
                      </div>
                      {col.key === "registered" && (
                        <p className="text-[10px] text-slate-400 lowercase mt-0.5 italic">Awaiting triage</p>
                      )}
                    </div>
                    <div className="space-y-2 flex-1">
                      <AnimatePresence mode="popLayout">
                        {items.length === 0 ? (
                          <motion.p key="empty" className="text-xs text-slate-400 text-center py-4">
                            Empty
                          </motion.p>
                        ) : (
                          items.map((entry) => (
                            <QueueCard key={entry.id} entry={entry} onClick={() => setActiveEntry(entry)} />
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recently Cancelled Drawer */}
          <Collapsible className="mt-12 w-full border rounded-xl overflow-hidden bg-slate-50/50">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-tight">
                Recently Cancelled Today ({cancelledToday.length})
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </CollapsibleTrigger>
            <CollapsibleContent className="p-2 space-y-2 border-t">
              {cancelledToday.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No cancellations today.</p>
              ) : (
                cancelledToday.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700">
                        #{entry.queue_number} {entry.patients?.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {format(new Date(entry.cancelled_at), "HH:mm")} • {entry.cancellation_reason}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[10px] gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => restoreEntry.mutate({ id: entry.id, existingNotes: entry.visit_notes })}
                      >
                        <RefreshCcw className="h-3 w-3" /> Restore
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
              Queue #{activeEntry?.queue_number ?? "—"}
              {activeEntry?.is_urgent && (
                <span className="ml-2 inline-flex items-center gap-1 text-rose-600 text-sm font-normal">
                  <AlertCircle className="h-4 w-4" /> Urgent
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-slate-500">
              {activeEntry?.patients?.name ? toMalayTitleCase(activeEntry.patients.name) : "Unknown patient"}
            </SheetDescription>
          </SheetHeader>

          {activeEntry && (
            <div className={cn(bento, "mt-6 p-5 space-y-4 text-sm")}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status</p>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      STATUS_COLORS[activeEntry.clinic_status as ClinicStatus],
                    )}
                  >
                    {STATUS_LABELS[activeEntry.clinic_status as ClinicStatus]}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Wait Time</p>
                  <p className="text-slate-800 font-mono">
                    {formatDistanceToNowStrict(new Date(activeEntry.created_at))}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Visit purpose</p>
                <p className="text-slate-800 capitalize">{activeEntry.visit_purpose.replace(/_/g, " ")}</p>
              </div>

              {activeEntry.visit_notes && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-slate-800 whitespace-pre-wrap text-xs bg-slate-50 p-2 rounded border border-slate-100">
                    {activeEntry.visit_notes}
                  </p>
                </div>
              )}

              {/* Action Section */}
              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                {activeEntry.clinic_status === "registered" && (
                  <div className="space-y-2">
                    <Button
                      className={cn(primaryBtn, "w-full shadow-lg shadow-blue-100")}
                      disabled={isLocum}
                      onClick={() => setVitalsOpen(true)}
                    >
                      <Activity className="h-4 w-4 mr-2" /> Take Vitals / Triage
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-slate-400 text-xs hover:text-slate-600"
                      disabled={updateQueue.isPending || isLocum}
                      onClick={() => {
                        updateQueue.mutate(
                          { id: activeEntry.id, clinic_status: "ready_for_doctor" },
                          {
                            onSuccess: () => {
                              setActiveEntry(null);
                              toast.success("Sent to Doctor (Triage Skipped)");
                            },
                          },
                        );
                      }}
                    >
                      Skip Triage → Send to Doctor
                    </Button>
                  </div>
                )}

                {(activeEntry.clinic_status === "sent_to_dispensary" ||
                  activeEntry.clinic_status === "dispensing_payment") && (
                  <Button
                    variant="ghost"
                    className={secondaryBtn}
                    disabled={isLocum}
                    onClick={() => {
                      navigate(`/clinic/queue/checkout/${activeEntry.id}`);
                      setActiveEntry(null);
                    }}
                  >
                    Open Checkout
                  </Button>
                )}

                {/* Terminal Cancellation Action */}
                {ACTIVE_STATUSES.includes(activeEntry.clinic_status as ClinicStatus) && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-rose-400 hover:text-rose-600 hover:bg-rose-50 gap-2 font-normal"
                      disabled={isLocum}
                      onClick={() => setCancelOpen(true)}
                    >
                      <UserX className="h-4 w-4" /> Patient Absconded / Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog Mounts */}
      <VitalsEntryDialog
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        queueEntryId={activeEntry?.id ?? ""}
        patientId={activeEntry?.patient_id ?? ""}
      />

      <CancelQueueEntryDialog open={cancelOpen} onOpenChange={setCancelOpen} entry={activeEntry} />

      <CheckInAppointmentDialog open={appointmentDialog} onOpenChange={setAppointmentDialog} />
      <CheckInWalkInDialog open={walkInDialog} onOpenChange={setWalkInDialog} />
      <RegisterAndCheckInDialog open={registerDialog} onOpenChange={setRegisterDialog} />
    </>
  );
}
