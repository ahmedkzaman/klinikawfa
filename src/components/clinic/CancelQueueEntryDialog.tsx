import { useEffect, useState } from 'react';
import { AlertTriangle, UserX } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useCancelQueueEntry } from '@/hooks/clinic/useQueueEntries';
import { usePatientVitalHistory } from '@/hooks/clinic/useVitalSigns';
import { checkRedFlagVitals } from '@/lib/clinic/redFlagVitals';
import type { QueueEntryWithJoins } from '@/types/clinic';
import { formatQueueNo } from '@/lib/clinic/queueNumber';

const REASONS = [
  'LWBS (Left Without Being Seen)',
  'Called 3× — no response',
  'Left before treatment',
  'Duplicate / Registration error',
  'Other',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: QueueEntryWithJoins | null;
}

export function CancelQueueEntryDialog({ open, onOpenChange, entry }: Props) {
  const [selected, setSelected] = useState('');
  const [other, setOther] = useState('');
  const [ack, setAck] = useState(false);
  const cancel = useCancelQueueEntry();

  const { data: history } = usePatientVitalHistory(entry?.patient_id);
  const latestVitals = history?.[0] ?? null;
  const redFlag = checkRedFlagVitals(latestVitals);

  // Reset form whenever the dialog (re)opens for a new entry
  useEffect(() => {
    if (open) {
      setSelected('');
      setOther('');
      setAck(false);
    }
  }, [open, entry?.id]);

  const otherTooShort = selected === 'Other' && other.trim().length < 5;
  const reasonInvalid = !selected || otherTooShort;
  const redFlagBlocked = !!redFlag && !ack;
  const disabled = reasonInvalid || redFlagBlocked || cancel.isPending;

  const handleConfirm = async () => {
    if (!entry) return;
    const reason = selected === 'Other' ? other.trim() : selected;
    await cancel.mutateAsync({
      id: entry.id,
      reason,
      existingNotes: entry.visit_notes,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserX className="h-5 w-5" />
            Terminate Clinical Visit
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {entry?.patients?.name ?? 'Unknown patient'}
            </span>{' '}
            · Queue {formatQueueNo(entry?.created_at, entry?.queue_sequence)}
            <br />
            This is a terminal action. The visit will leave the live board and appear in
            <span className="font-medium"> Recently Cancelled </span>
            for the rest of today. If the patient returns, register a new visit.
          </DialogDescription>
        </DialogHeader>

        {redFlag && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">{redFlag} detected</p>
                <p className="text-xs text-destructive/80">
                  This patient has critical vitals on record. Cancellation requires
                  acknowledgment.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground leading-snug">
                I have reviewed this patient's critical vitals and accept clinical
                responsibility for terminating the visit.
              </span>
            </label>
          </div>
        )}

        <div className="space-y-3 py-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Reason
          </Label>
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
            {REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`reason-${r}`} />
                <Label htmlFor={`reason-${r}`} className="font-normal cursor-pointer">
                  {r}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {selected === 'Other' && (
            <Textarea
              placeholder="Describe what happened (min. 5 characters)…"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="mt-1"
              rows={3}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Keep Active
          </Button>
          <Button variant="destructive" disabled={disabled} onClick={handleConfirm}>
            {cancel.isPending ? 'Terminating…' : 'Confirm Termination'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
