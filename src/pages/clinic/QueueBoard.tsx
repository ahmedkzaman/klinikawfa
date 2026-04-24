import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ListOrdered, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useQueueEntries, useUpdateQueueEntry } from '@/hooks/clinic/useQueueEntries';
import { useTodayAppointments } from '@/hooks/clinic/useTodayAppointments';
import { CheckInAppointmentDialog } from '@/components/clinic/CheckInAppointmentDialog';
import { CheckInWalkInDialog } from '@/components/clinic/CheckInWalkInDialog';
import {
  QUEUE_COLUMNS,
  STATUS_COLORS,
  STATUS_LABELS,
  type ClinicStatus,
  type QueueEntryWithJoins,
} from '@/types/clinic';
import { cn } from '@/lib/utils';

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
        'w-full text-left rounded-md border bg-card p-3 hover:border-primary transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-2xl font-semibold text-foreground leading-none">
          {entry.queue_number ?? '—'}
        </span>
        {entry.is_urgent && (
          <span
            className="h-2 w-2 rounded-full bg-destructive mt-1"
            aria-label="Urgent"
            title="Urgent"
          />
        )}
      </div>
      <p className="font-medium text-sm text-foreground truncate">
        {entry.patients?.name ?? 'Unknown patient'}
      </p>
      <div className="flex items-center justify-between mt-2 gap-2">
        <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[status])}>
          {STATUS_LABELS[status]}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{waited}</span>
      </div>
      {entry.doctors?.name && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          Dr. {entry.doctors.name}
        </p>
      )}
    </motion.button>
  );
}

export default function QueueBoard() {
  useTickEveryMinute();
  const { data: entries = [], isLoading } = useQueueEntries();
  const { data: appointments = [] } = useTodayAppointments();
  const updateQueue = useUpdateQueueEntry();

  const [appointmentDialog, setAppointmentDialog] = useState(false);
  const [walkInDialog, setWalkInDialog] = useState(false);
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithJoins | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, QueueEntryWithJoins[]>();
    QUEUE_COLUMNS.forEach((c) => map.set(c.key, []));
    entries.forEach((e) => {
      const status = e.clinic_status as ClinicStatus;
      const col = QUEUE_COLUMNS.find((c) => c.statuses.includes(status));
      if (col) map.get(col.key)!.push(e);
    });
    return map;
  }, [entries]);

  const totalActive = entries.length;

  return (
    <>
      <SEOHead
        title="Queue Board — Clinic Portal"
        description="Live queue board for active patients."
        noIndex
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Queue Board</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, d MMMM yyyy')} · {totalActive} active
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setWalkInDialog(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Walk-In
          </Button>
          <Button
            onClick={() => setAppointmentDialog(true)}
            disabled={appointments.length === 0}
            title={appointments.length === 0 ? 'No pending appointments today' : undefined}
          >
            <Plus className="h-4 w-4 mr-1" /> Check In Appointment
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : totalActive === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ListOrdered className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              No active patients. Check in an appointment or walk-in to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {QUEUE_COLUMNS.map((col) => {
            const items = grouped.get(col.key) ?? [];
            return (
              <div
                key={col.key}
                className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col min-h-[180px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-foreground">{col.label}</h2>
                  <Badge variant="secondary" className="tabular-nums">
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2 flex-1">
                  <AnimatePresence mode="popLayout">
                    {items.length === 0 && (
                      <motion.p
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-muted-foreground text-center py-4"
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

      {/* Detail sheet */}
      <Sheet open={!!activeEntry} onOpenChange={(o) => !o && setActiveEntry(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Queue #{activeEntry?.queue_number ?? '—'}
              {activeEntry?.is_urgent && (
                <span className="ml-2 inline-flex items-center gap-1 text-destructive text-sm font-normal">
                  <AlertCircle className="h-4 w-4" /> Urgent
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              {activeEntry?.patients?.name ?? 'Unknown patient'}
            </SheetDescription>
          </SheetHeader>

          {activeEntry && (
            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Status
                </p>
                <Badge
                  variant="outline"
                  className={STATUS_COLORS[activeEntry.clinic_status as ClinicStatus]}
                >
                  {STATUS_LABELS[activeEntry.clinic_status as ClinicStatus]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Phone
                </p>
                <p className="text-foreground">{activeEntry.patients?.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Visit purpose
                </p>
                <p className="text-foreground capitalize">
                  {activeEntry.visit_purpose.replace(/_/g, ' ')}
                </p>
              </div>
              {activeEntry.visit_notes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Notes
                  </p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {activeEntry.visit_notes}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Created
                </p>
                <p className="text-foreground">
                  {format(new Date(activeEntry.created_at), 'd MMM yyyy, HH:mm')}
                </p>
              </div>

              <div className="pt-4 border-t flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => toast('Send to Doctor — wired in Step 6')}
                >
                  Send to Doctor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast('Mark Done — wired in Step 6')}
                >
                  Mark Done
                </Button>
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
    </>
  );
}
