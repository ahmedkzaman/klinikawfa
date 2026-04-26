import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PatientPicker } from '@/components/clinic/PatientPicker';
import { RegisterPatientDialog } from '@/components/clinic/RegisterPatientDialog';
import { useCheckInWalkIn } from '@/hooks/clinic/useIntakeAppointment';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import { usePatientOutstanding, formatRm } from '@/hooks/clinic/usePatientFinancials';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PatientRow } from '@/types/clinic';

const VISIT_PURPOSES = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'medical_check', label: 'Medical check-up' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'other', label: 'Other' },
];

interface CheckInWalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPatient?: PatientRow | null;
}

export function CheckInWalkInDialog({
  open,
  onOpenChange,
  initialPatient,
}: CheckInWalkInDialogProps) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [purpose, setPurpose] = useState('consultation');
  const [notes, setNotes] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [payerType, setPayerType] = useState<'self' | 'panel'>('self');
  const [panelId, setPanelId] = useState<string>('');
  const checkIn = useCheckInWalkIn();
  const { data: panels = [] } = useInsuranceProviders({ activeOnly: true });

  useEffect(() => {
    if (open && initialPatient) {
      setPatient(initialPatient);
    }
  }, [open, initialPatient]);

  const reset = () => {
    setPatient(null);
    setPurpose('consultation');
    setNotes('');
    setPayerType('self');
    setPanelId('');
  };

  const handleSubmit = async () => {
    if (!patient) return;
    if (payerType === 'panel' && !panelId) {
      toast.error('Please select a panel');
      return;
    }
    try {
      await checkIn.mutateAsync({
        patientId: patient.id,
        visitPurpose: purpose,
        notes: notes || null,
        panelId: payerType === 'panel' ? panelId : null,
      });
      toast.success(`${patient.name} added to queue`);
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Check In Walk-In</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Patient *</Label>
                {!patient && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => setRegisterOpen(true)}
                  >
                    <UserPlus className="mr-1" />
                    Register new
                  </Button>
                )}
              </div>
              <PatientPicker
                value={patient}
                onChange={setPatient}
                onRegisterNew={() => setRegisterOpen(true)}
              />
            </div>

            <div>
              <Label htmlFor="purpose">Visit purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger id="purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_PURPOSES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Payer</Label>
              <RadioGroup
                value={payerType}
                onValueChange={(v) => setPayerType(v as 'self' | 'panel')}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="self" id="payer-self" />
                  <Label htmlFor="payer-self" className="font-normal cursor-pointer">
                    Self Pay
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="panel" id="payer-panel" />
                  <Label htmlFor="payer-panel" className="font-normal cursor-pointer">
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

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
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
            <Button onClick={handleSubmit} disabled={!patient || checkIn.isPending}>
              {checkIn.isPending ? 'Checking in…' : 'Check in'}
            </Button>
          </DialogFooter>
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
