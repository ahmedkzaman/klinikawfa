import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Save, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateQueueEntry } from '@/hooks/clinic/useQueueEntries';
import { useRecordVitalSigns } from '@/hooks/clinic/useVitalSigns';
import { useDoctors } from '@/hooks/clinic/useDoctors';
import { primaryBtn, secondaryBtn } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';

interface VitalsEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntryId: string;
  patientId: string;
}

type FormState = {
  bp_systolic: string;
  bp_diastolic: string;
  heart_rate: string;
  pain_scale: string;
  temperature_c: string;
  spo2: string;
  respiratory_rate: string;
  weight_kg: string;
  height_cm: string;
  blood_glucose: string;
};

const EMPTY_FORM: FormState = {
  bp_systolic: '',
  bp_diastolic: '',
  heart_rate: '',
  pain_scale: '',
  temperature_c: '',
  spo2: '',
  respiratory_rate: '',
  weight_kg: '',
  height_cm: '',
  blood_glucose: '',
};

const toNum = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function VitalsEntryDialog({
  open,
  onOpenChange,
  queueEntryId,
  patientId,
}: VitalsEntryDialogProps) {
  const recordVitals = useRecordVitalSigns();
  const updateQueue = useUpdateQueueEntry();
  const { data: doctors } = useDoctors();
  const activeDoctors = (doctors ?? []).filter((d) => d.status === 'active');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [assignedDoctorId, setAssignedDoctorId] = useState<string | null>(null);

  // Reset assignment when dialog closes so the next patient starts clean
  useEffect(() => {
    if (!open) setAssignedDoctorId(null);
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (sendToDoctor: boolean) => {
    if (!queueEntryId || !patientId) return;
    if (sendToDoctor && !assignedDoctorId) {
      toast.error('Select an attending doctor before sending');
      return;
    }
    setSubmitting(true);
    try {
      // pain_scale is collected for triage context but not yet a column on vital_signs.
      // Drop it from the payload until a migration adds the column.
      await recordVitals.mutateAsync({
        patient_id: patientId,
        queue_entry_id: queueEntryId,
        bp_systolic: toNum(form.bp_systolic),
        bp_diastolic: toNum(form.bp_diastolic),
        heart_rate: toNum(form.heart_rate),
        temperature_c: toNum(form.temperature_c),
        spo2: toNum(form.spo2),
        respiratory_rate: toNum(form.respiratory_rate),
        weight_kg: toNum(form.weight_kg),
        height_cm: toNum(form.height_cm),
        blood_glucose: toNum(form.blood_glucose),
      });

      if (sendToDoctor) {
        await updateQueue.mutateAsync({
          id: queueEntryId,
          clinic_status: 'ready_for_doctor',
          assigned_doctor_id: assignedDoctorId,
        });
        toast.success('Triage complete: patient sent to doctor');
      } else {
        toast.success('Vitals saved');
      }

      setForm(EMPTY_FORM);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save triage data';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Activity className="h-5 w-5 text-primary" />
            Nurse Station: Patient Triage
          </DialogTitle>
          <DialogDescription>
            Record vital signs for the current visit. All fields are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* Circulation */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Circulation
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bp_sys">BP (Sys)</Label>
                <Input
                  id="bp_sys"
                  type="number"
                  inputMode="numeric"
                  placeholder="mmHg"
                  value={form.bp_systolic}
                  onChange={(e) => set('bp_systolic', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bp_dia">BP (Dia)</Label>
                <Input
                  id="bp_dia"
                  type="number"
                  inputMode="numeric"
                  placeholder="mmHg"
                  value={form.bp_diastolic}
                  onChange={(e) => set('bp_diastolic', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr">Heart rate (bpm)</Label>
              <Input
                id="hr"
                type="number"
                inputMode="numeric"
                value={form.heart_rate}
                onChange={(e) => set('heart_rate', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pain">Pain scale (0–10)</Label>
              <Input
                id="pain"
                type="number"
                inputMode="numeric"
                min={0}
                max={10}
                value={form.pain_scale}
                onChange={(e) => set('pain_scale', e.target.value)}
              />
            </div>
          </div>

          {/* Metabolic & Respiratory */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metabolic &amp; Respiratory
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="temp">Temp (°C)</Label>
                <Input
                  id="temp"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.temperature_c}
                  onChange={(e) => set('temperature_c', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spo2">SpO₂ (%)</Label>
                <Input
                  id="spo2"
                  type="number"
                  inputMode="numeric"
                  value={form.spo2}
                  onChange={(e) => set('spo2', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.weight_kg}
                  onChange={(e) => set('weight_kg', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.height_cm}
                  onChange={(e) => set('height_cm', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="glucose">Glucose (mmol/L)</Label>
              <Input
                id="glucose"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.blood_glucose}
                onChange={(e) => set('blood_glucose', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Attending Doctor Assignment — required to send to doctor */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Stethoscope className="h-3 w-3" /> Attending Doctor
          </Label>
          <Select
            value={assignedDoctorId ?? undefined}
            onValueChange={(v) => setAssignedDoctorId(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select doctor on duty" />
            </SelectTrigger>
            <SelectContent>
              {activeDoctors.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400">No active doctors</div>
              ) : (
                activeDoctors.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    Dr. {doc.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {!assignedDoctorId && (
            <p className="text-[10px] text-amber-600 italic">
              A doctor must be assigned before the patient can be sent through.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className={secondaryBtn}
            onClick={() => handleSave(false)}
            disabled={submitting}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Only
          </Button>
          <Button
            className={cn(primaryBtn)}
            onClick={() => handleSave(true)}
            disabled={submitting || !assignedDoctorId}
          >
            {submitting ? 'Saving…' : 'Save & Send to Doctor'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
