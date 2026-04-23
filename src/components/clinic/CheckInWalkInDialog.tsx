import { useState } from 'react';
import { toast } from 'sonner';
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
import { PatientPicker } from '@/components/clinic/PatientPicker';
import { RegisterPatientDialog } from '@/components/clinic/RegisterPatientDialog';
import { useCheckInWalkIn } from '@/hooks/clinic/useIntakeAppointment';
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
}

export function CheckInWalkInDialog({ open, onOpenChange }: CheckInWalkInDialogProps) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [purpose, setPurpose] = useState('consultation');
  const [notes, setNotes] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const checkIn = useCheckInWalkIn();

  const reset = () => {
    setPatient(null);
    setPurpose('consultation');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!patient) return;
    try {
      await checkIn.mutateAsync({
        patientId: patient.id,
        visitPurpose: purpose,
        notes: notes || null,
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
              <Label className="mb-2 block">Patient *</Label>
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
