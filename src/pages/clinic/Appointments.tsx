import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parse, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Calendar as CalIcon, MessageCircle, CalendarClock } from 'lucide-react';
import { generateAppointmentReminderLink } from '@/lib/clinic/whatsappUtils';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { toMalayTitleCase } from '@/lib/textCase';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PatientPicker } from '@/components/clinic/PatientPicker';
import { CheckInWalkInDialog } from '@/components/clinic/CheckInWalkInDialog';
import {
  useClinicAppointmentsRange,
  useUpdateClinicAppointment,
  type ClinicAppointmentRange,
} from '@/hooks/clinic/useClinicAppointmentsRange';
import { useCreateClinicAppointment } from '@/hooks/clinic/useClinicAppointments';
import { useDoctors } from '@/hooks/clinic/useDoctors';
import { usePatients } from '@/hooks/clinic/usePatients';
import { bento, pageInner, pageShell, primaryBtn, secondaryBtn } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';
import type { PatientRow } from '@/types/clinic';

const SLOT_MINUTES = 30;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 23;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const TOTAL_SLOTS = (DAY_END_HOUR - DAY_START_HOUR) * SLOTS_PER_HOUR;

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  arrived: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  in_progress: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200 line-through',
  no_show: 'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

function timeToSlot(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h - DAY_START_HOUR) * SLOTS_PER_HOUR + Math.floor(m / SLOT_MINUTES);
}

function slotToTime(slot: number) {
  const totalMin = DAY_START_HOUR * 60 + slot * SLOT_MINUTES;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function Appointments() {
  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(new Date());

  const { fromDate, toDate, days } = useMemo(() => {
    if (view === 'day') {
      const d = format(anchor, 'yyyy-MM-dd');
      return { fromDate: d, toDate: d, days: [anchor] };
    }
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const arr = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return {
      fromDate: format(arr[0], 'yyyy-MM-dd'),
      toDate: format(arr[6], 'yyyy-MM-dd'),
      days: arr,
    };
  }, [view, anchor]);

  const { data: appts = [], isLoading } = useClinicAppointmentsRange(fromDate, toDate);

  const [newDialog, setNewDialog] = useState<{ open: boolean; date: string; time: string }>({
    open: false,
    date: '',
    time: '',
  });
  const [selected, setSelected] = useState<ClinicAppointmentRange | null>(null);

  const handleSlotClick = (date: Date, slot: number) => {
    setNewDialog({
      open: true,
      date: format(date, 'yyyy-MM-dd'),
      time: slotToTime(slot),
    });
  };

  const shift = (delta: number) => {
    setAnchor((a) => addDays(a, view === 'day' ? delta : delta * 7));
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Appointments</h1>
            <p className="text-sm text-slate-500">
              Schedule visits and check patients straight into the queue.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              <button
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md',
                  view === 'day' ? 'bg-blue-600 text-white' : 'text-slate-600',
                )}
                onClick={() => setView('day')}
              >
                Day
              </button>
              <button
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md',
                  view === 'week' ? 'bg-blue-600 text-white' : 'text-slate-600',
                )}
                onClick={() => setView('week')}
              >
                Week
              </button>
            </div>

            <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>

            <span className="text-sm font-medium text-slate-700 ml-2">
              {view === 'day'
                ? format(anchor, 'EEEE, d MMM yyyy')
                : `${format(days[0], 'd MMM')} – ${format(days[6], 'd MMM yyyy')}`}
            </span>

            <Button
              className={primaryBtn}
              onClick={() =>
                setNewDialog({
                  open: true,
                  date: format(anchor, 'yyyy-MM-dd'),
                  time: '09:00',
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </div>

        <Card className={cn(bento, 'p-0 overflow-hidden')}>
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading…</div>
          ) : (
            <CalendarGrid
              days={days}
              appts={appts}
              onSlotClick={handleSlotClick}
              onApptClick={setSelected}
            />
          )}
        </Card>
      </div>

      <NewAppointmentDialog
        open={newDialog.open}
        date={newDialog.date}
        time={newDialog.time}
        onOpenChange={(o) => setNewDialog((s) => ({ ...s, open: o }))}
      />

      {selected && (
        <AppointmentDetailsSheet
          appt={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CalendarGrid({
  days,
  appts,
  onSlotClick,
  onApptClick,
}: {
  days: Date[];
  appts: ClinicAppointmentRange[];
  onSlotClick: (date: Date, slot: number) => void;
  onApptClick: (a: ClinicAppointmentRange) => void;
}) {
  // Build a per-day lookup
  const byDay = useMemo(() => {
    const map = new Map<string, ClinicAppointmentRange[]>();
    for (const a of appts) {
      const key = a.appointment_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appts]);

  return (
    <div
      className="grid border-t border-slate-100"
      style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0,1fr))` }}
    >
      {/* Header row */}
      <div className="bg-slate-50 border-b border-r border-slate-100" />
      {days.map((d) => {
        const isToday = format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        return (
          <div
            key={d.toISOString()}
            className={cn(
              'bg-slate-50 border-b border-r border-slate-100 px-2 py-2 text-center',
              isToday && 'bg-blue-50',
            )}
          >
            <div className="text-xs text-slate-500 uppercase">{format(d, 'EEE')}</div>
            <div
              className={cn(
                'text-sm font-semibold',
                isToday ? 'text-blue-700' : 'text-slate-800',
              )}
            >
              {format(d, 'd MMM')}
            </div>
          </div>
        );
      })}

      {/* Time rows */}
      {Array.from({ length: TOTAL_SLOTS }, (_, slot) => {
        const isHourMark = slot % SLOTS_PER_HOUR === 0;
        return (
          <FragmentRow
            key={slot}
            slot={slot}
            isHourMark={isHourMark}
            days={days}
            byDay={byDay}
            onSlotClick={onSlotClick}
            onApptClick={onApptClick}
          />
        );
      })}
    </div>
  );
}

function FragmentRow({
  slot,
  isHourMark,
  days,
  byDay,
  onSlotClick,
  onApptClick,
}: {
  slot: number;
  isHourMark: boolean;
  days: Date[];
  byDay: Map<string, ClinicAppointmentRange[]>;
  onSlotClick: (date: Date, slot: number) => void;
  onApptClick: (a: ClinicAppointmentRange) => void;
}) {
  const time = slotToTime(slot);
  return (
    <>
      <div
        className={cn(
          'border-r border-slate-100 px-2 text-[10px] text-slate-400 text-right',
          isHourMark ? 'border-t border-slate-200 pt-1' : 'border-t border-dashed border-slate-100',
        )}
        style={{ minHeight: 28 }}
      >
        {isHourMark ? time : ''}
      </div>
      {days.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const items = (byDay.get(key) ?? []).filter(
          (a) => timeToSlot(a.appointment_time) === slot,
        );
        return (
          <button
            key={key + slot}
            type="button"
            onClick={() => items.length === 0 && onSlotClick(d, slot)}
            className={cn(
              'border-r border-slate-100 text-left px-1 relative hover:bg-blue-50/40',
              isHourMark
                ? 'border-t border-slate-200'
                : 'border-t border-dashed border-slate-100',
            )}
            style={{ minHeight: 28 }}
          >
            {items.map((a) => (
              <span
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onApptClick(a);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    onApptClick(a);
                  }
                }}
                className={cn(
                  'block w-full truncate rounded border px-1.5 py-0.5 text-[11px] font-medium cursor-pointer my-0.5',
                  STATUS_STYLES[a.status] ?? STATUS_STYLES.scheduled,
                )}
              >
                {a.appointment_time.slice(0, 5)} · {a.patients?.name ? toMalayTitleCase(a.patients.name) : 'Patient'}
              </span>
            ))}
          </button>
        );
      })}
    </>
  );
}

function NewAppointmentDialog({
  open,
  onOpenChange,
  date,
  time,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  time: string;
}) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  const [doctorId, setDoctorId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const create = useCreateClinicAppointment();
  const { data: doctors = [] } = useDoctors();

  useEffect(() => {
    if (open) {
      setPatient(null);
      setD(date);
      setT(time);
      setDoctorId('');
      setNotes('');
    }
  }, [open, date, time]);

  const submit = async () => {
    if (!patient) return toast.error('Select a patient');
    try {
      await create.mutateAsync({
        patient_id: patient.id,
        doctor_id: doctorId || null,
        appointment_date: d,
        appointment_time: t,
        notes: notes || null,
      });
      toast.success('Appointment scheduled');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ad">Date</Label>
              <Input
                id="ad"
                type="date"
                value={d}
                onChange={(e) => setD(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="at">Time</Label>
              <Input
                id="at"
                type="time"
                value={t}
                onChange={(e) => setT(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue placeholder="Any doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="an">Notes</Label>
            <Textarea
              id="an"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending} className={primaryBtn}>
            {create.isPending ? 'Saving…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDetailsSheet({
  appt,
  onClose,
}: {
  appt: ClinicAppointmentRange;
  onClose: () => void;
}) {
  const update = useUpdateClinicAppointment();
  const { data: patients = [] } = usePatients(appt.patients?.name ?? '');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState<Date | undefined>(
    parse(appt.appointment_date, 'yyyy-MM-dd', new Date()),
  );
  const [newTime, setNewTime] = useState<string>(appt.appointment_time.slice(0, 5));
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Find the full patient row for the check-in dialog (it needs PatientRow shape)
  const fullPatient =
    patients.find((p) => p.id === appt.patient_id) ??
    ({ id: appt.patient_id, name: appt.patients?.name ?? 'Patient' } as PatientRow);

  const setStatus = async (status: string) => {
    try {
      await update.mutateAsync({ id: appt.id, status });
      toast.success('Updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const arriveAndCheckIn = async () => {
    try {
      await update.mutateAsync({ id: appt.id, status: 'arrived' });
      setCheckInOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const submitReschedule = async () => {
    if (!newDate || !newTime) {
      toast.error('Pick a date and time');
      return;
    }
    try {
      await update.mutateAsync({
        id: appt.id,
        appointment_date: format(newDate, 'yyyy-MM-dd'),
        appointment_time: `${newTime}:00`,
      });
      toast.success('Appointment rescheduled');
      setRescheduleOpen(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const canReschedule = !['completed', 'cancelled'].includes(appt.status);
  const date = parse(appt.appointment_date, 'yyyy-MM-dd', new Date());

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Appointment</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 space-y-1">
              <div className="text-xs text-slate-500 uppercase">Patient</div>
              <div className="font-semibold text-slate-900">
                {appt.patients?.name ? toMalayTitleCase(appt.patients.name) : 'Patient'}
              </div>
              {appt.patients?.phone && (
                <div className="text-sm text-slate-600">{appt.patients.phone}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> Date
                </div>
                <div className="font-medium">{format(date, 'EEE, d MMM yyyy')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <CalIcon className="h-3 w-3" /> Time
                </div>
                <div className="font-medium">{appt.appointment_time.slice(0, 5)}</div>
              </div>
            </div>

            {appt.doctors?.name && (
              <div className="text-sm">
                <span className="text-slate-500">Doctor: </span>
                <span className="font-medium">{appt.doctors.name}</span>
              </div>
            )}

            <div>
              <span
                className={cn(
                  'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
                  STATUS_STYLES[appt.status] ?? STATUS_STYLES.scheduled,
                )}
              >
                {STATUS_LABEL[appt.status] ?? appt.status}
              </span>
            </div>

            {appt.notes && (
              <div className="rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {appt.notes}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-100">
              {appt.patients?.phone && !['completed', 'cancelled', 'no_show'].includes(appt.status) && (
                <Button
                  variant="outline"
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white border-emerald-600"
                  onClick={() => {
                    const dt = parse(
                      `${appt.appointment_date} ${appt.appointment_time}`,
                      'yyyy-MM-dd HH:mm:ss',
                      new Date(),
                    );
                    const safeDt = isNaN(dt.getTime())
                      ? parse(
                          `${appt.appointment_date} ${appt.appointment_time.slice(0, 5)}`,
                          'yyyy-MM-dd HH:mm',
                          new Date(),
                        )
                      : dt;
                    const link = generateAppointmentReminderLink(
                      appt.patients?.name ? toMalayTitleCase(appt.patients.name) : 'Patient',
                      appt.patients!.phone!,
                      safeDt,
                    );
                    window.open(link, '_blank');
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  Send WhatsApp Reminder
                </Button>
              )}
              {!['arrived', 'completed', 'cancelled', 'in_progress'].includes(appt.status) && (
                <Button
                  className={cn(primaryBtn, 'w-full')}
                  onClick={arriveAndCheckIn}
                  disabled={update.isPending}
                >
                  Mark Arrived &amp; Check-In
                </Button>
              )}
              {appt.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  className={cn(secondaryBtn, 'w-full')}
                  onClick={() => setStatus('cancelled')}
                  disabled={update.isPending}
                >
                  Cancel Appointment
                </Button>
              )}
              {appt.status !== 'no_show' && (
                <Button
                  variant="outline"
                  className={cn(secondaryBtn, 'w-full')}
                  onClick={() => setStatus('no_show')}
                  disabled={update.isPending}
                >
                  Mark No Show
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CheckInWalkInDialog
        open={checkInOpen}
        onOpenChange={(o) => {
          setCheckInOpen(o);
          if (!o) onClose();
        }}
        initialPatient={fullPatient}
      />
    </>
  );
}
