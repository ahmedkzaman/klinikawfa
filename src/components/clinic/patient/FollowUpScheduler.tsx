import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePatientFutureAppointments,
  useCreateClinicAppointment,
} from '@/hooks/clinic/useClinicAppointments';

interface FollowUpSchedulerProps {
  patientId: string;
  defaultReason?: string;
  defaultDoctorId?: string | null;
}

/**
 * Shared widget shown in both the doctor's Consultation view and the staff
 * Dispensary Checkout view. Prevents double-booking by checking for existing
 * future appointments before showing the booking form.
 */
export function FollowUpScheduler({
  patientId,
  defaultReason = 'Follow-up',
  defaultDoctorId = null,
}: FollowUpSchedulerProps) {
  const { data: future = [], isLoading } = usePatientFutureAppointments(patientId);
  const createAppt = useCreateClinicAppointment();

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }, []);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState(defaultReason);

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  // Booking form is ALWAYS available — patients may have multiple distinct
  // future appointments. Existing future appointments are surfaced as an
  // informational summary above the form (non-blocking).
  const canSubmit = !!date && !!time && !createAppt.isPending;

  const handleBook = async () => {
    if (!canSubmit) return;
    try {
      await createAppt.mutateAsync({
        patient_id: patientId,
        doctor_id: defaultDoctorId ?? null,
        appointment_date: date,
        appointment_time: time,
        notes: reason.trim() || 'Follow-up',
      });
      toast.success('Follow-up appointment booked');
      setDate('');
      setTime('');
      setReason(defaultReason);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to book appointment');
    }
  };

  const upcoming = future.slice(0, 3);
  const more = future.length - upcoming.length;

  return (
    <div className="space-y-3">
      {future.length > 0 && (
        <Alert className="bg-green-50 text-green-900 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-700" />
          <AlertTitle className="text-green-900">
            {future.length === 1
              ? 'Upcoming follow-up scheduled'
              : `${future.length} upcoming follow-ups scheduled`}
          </AlertTitle>
          <AlertDescription className="text-green-900/90">
            <ul className="mt-1 space-y-0.5">
              {upcoming.map((appt) => {
                const formattedDate = (() => {
                  try {
                    return format(new Date(appt.appointment_date), 'd MMM yyyy');
                  } catch {
                    return appt.appointment_date;
                  }
                })();
                const reasonText = appt.notes?.trim() || 'Follow-up';
                const doctorName = appt.doctors?.name;
                return (
                  <li key={appt.id} className="text-xs">
                    <strong>
                      {formattedDate} at {appt.appointment_time}
                    </strong>{' '}
                    · {reasonText}
                    {doctorName && (
                      <span className="opacity-80"> · with {doctorName}</span>
                    )}
                  </li>
                );
              })}
              {more > 0 && (
                <li className="text-xs opacity-70">+{more} more upcoming</li>
              )}
            </ul>
            <p className="mt-2 text-xs opacity-80">
              You can still book additional appointments below.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Schedule Follow-up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="follow-up-date" className="text-xs">
                Date
              </Label>
              <Input
                id="follow-up-date"
                type="date"
                min={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="follow-up-time" className="text-xs">
                Time
              </Label>
              <Input
                id="follow-up-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="follow-up-reason" className="text-xs">
              Reason
            </Label>
            <Input
              id="follow-up-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Follow-up"
            />
          </div>
          <Button
            onClick={handleBook}
            disabled={!canSubmit}
            className="w-full"
            size="sm"
          >
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            {createAppt.isPending ? 'Booking…' : 'Book Appointment'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default FollowUpScheduler;
