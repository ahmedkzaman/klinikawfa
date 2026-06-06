import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientPicker } from '@/components/clinic/PatientPicker';
import { toMalayTitleCase } from '@/lib/textCase';
import { RegisterPatientDialog } from '@/components/clinic/RegisterPatientDialog';
import { useTodayAppointments } from '@/hooks/clinic/useTodayAppointments';
import { useIntakeAppointment } from '@/hooks/clinic/useIntakeAppointment';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AppointmentRow, PatientRow } from '@/types/clinic';

interface CheckInAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInAppointmentDialog({ open, onOpenChange }: CheckInAppointmentDialogProps) {
  const { data: appointments = [], isLoading } = useTodayAppointments();
  const { data: panels = [] } = useInsuranceProviders({ activeOnly: true });
  const intake = useIntakeAppointment();

  const [activeAppt, setActiveAppt] = useState<AppointmentRow | null>(null);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [payerType, setPayerType] = useState<'self' | 'panel'>('self');
  const [panelId, setPanelId] = useState<string>('');

  const reset = () => {
    setActiveAppt(null);
    setPatient(null);
    setPayerType('self');
    setPanelId('');
  };

  const handleCheckIn = async () => {
    if (!activeAppt || !patient) return;
    if (payerType === 'panel' && !panelId) {
      toast.error('Please select a panel');
      return;
    }
    try {
      await intake.mutateAsync({
        appointmentId: activeAppt.id,
        patientId: patient.id,
        visitPurpose: activeAppt.service || 'consultation',
        notes: activeAppt.message,
        panelId: payerType === 'panel' ? panelId : null,
      });
      toast.success(`${toMalayTitleCase(patient.name)} added to queue`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Check-in failed';
      toast.error(msg);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Check In Appointment</DialogTitle>
            <DialogDescription>
              Pick today's appointment, then confirm which patient record matches.
            </DialogDescription>
          </DialogHeader>

          {!activeAppt ? (
            <div className="space-y-2">
              {isLoading && <Skeleton className="h-20 w-full" />}
              {!isLoading && appointments.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No pending appointments for today.
                  </CardContent>
                </Card>
              )}
              {appointments.map((a) => (
                <Card key={a.id} className="hover:border-primary transition-colors">
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{a.patient_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.appointment_time?.slice(0, 5)} · {a.service} · {a.patient_phone}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setActiveAppt(a)}>
                      Select
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="bg-muted/40 border-border">
                <CardContent className="py-3 text-sm">
                  <p className="font-medium text-foreground">{activeAppt.patient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeAppt.appointment_time?.slice(0, 5)} ·{' '}
                    {format(new Date(activeAppt.appointment_date), 'd MMM')} ·{' '}
                    {activeAppt.service}
                  </p>
                </CardContent>
              </Card>

              <div>
                <Label className="mb-2 block">Match to patient record</Label>
                <PatientPicker
                  value={patient}
                  onChange={setPatient}
                  onRegisterNew={() => setRegisterOpen(true)}
                />
              </div>

              <div>
                <Label className="mb-2 block">Payer</Label>
                <RadioGroup
                  value={payerType}
                  onValueChange={(v) => setPayerType(v as 'self' | 'panel')}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="self" id="appt-payer-self" />
                    <Label htmlFor="appt-payer-self" className="font-normal cursor-pointer">
                      Self Pay
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="panel" id="appt-payer-panel" />
                    <Label htmlFor="appt-payer-panel" className="font-normal cursor-pointer">
                      Panel
                    </Label>
                  </div>
                </RadioGroup>
                {payerType === 'panel' && (
                  <Select value={panelId} onValueChange={setPanelId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select panel" />
                    </SelectTrigger>
                    <SelectContent>
                      {panels.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={reset}>
                  Back
                </Button>
                <Button
                  onClick={handleCheckIn}
                  disabled={!patient || intake.isPending}
                >
                  {intake.isPending ? 'Checking in…' : 'Check in'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RegisterPatientDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onCreated={(p) => setPatient(p)}
      />
    </>
  );
}
