import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateConsultationItem } from '@/hooks/clinic/useConsultationItems';
import {
  DOSAGE_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  INSTRUCTION_OPTIONS,
  DURATION_OPTIONS,
} from '@/lib/clinic/prescribingOptions';

interface EditableItem {
  id: string;
  consultation_id: string;
  item_name: string;
  dosage_qty: number | null;
  dosage_unit: string | null;
  frequency: string | null;
  instruction: string | null;
  duration: string | null;
}

interface Props {
  item: EditableItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dispensary-side editor for prescribing instructions. Doctors set these on
 * the clinical screen, but nurses at the counter often need to fix a missing
 * frequency or tweak the duration before printing the bag label. RLS allows
 * `operations` / `admin` roles to perform this update.
 */
export function EditInstructionsDialog({ item, open, onOpenChange }: Props) {
  const update = useUpdateConsultationItem();
  const [dosageQty, setDosageQty] = useState<string>('');
  const [dosageUnit, setDosageUnit] = useState<string>('');
  const [frequency, setFrequency] = useState<string>('');
  const [instruction, setInstruction] = useState<string>('');
  const [duration, setDuration] = useState<string>('');

  useEffect(() => {
    if (!item) return;
    setDosageQty(item.dosage_qty != null ? String(item.dosage_qty) : '');
    setDosageUnit(item.dosage_unit ?? '');
    setFrequency(item.frequency ?? '');
    setInstruction(item.instruction ?? '');
    setDuration(item.duration ?? '');
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    const qtyNum = dosageQty.trim() === '' ? null : Number(dosageQty);
    if (qtyNum != null && Number.isNaN(qtyNum)) {
      toast.error('Dosage quantity must be a number');
      return;
    }
    try {
      await update.mutateAsync({
        id: item.id,
        consultationId: item.consultation_id,
        dosage_qty: qtyNum,
        dosage_unit: dosageUnit.trim() || null,
        frequency: frequency.trim() || null,
        instruction: instruction.trim() || null,
        duration: duration.trim() || null,
      });
      toast.success('Instructions updated');
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Instructions</DialogTitle>
          <DialogDescription className="truncate">
            {item?.item_name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-dosage-qty">Dosage qty</Label>
              <Input
                id="edit-dosage-qty"
                type="number"
                step="0.5"
                min="0"
                value={dosageQty}
                onChange={(e) => setDosageQty(e.target.value)}
                placeholder="e.g. 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-dosage-unit">Unit</Label>
              <Select value={dosageUnit} onValueChange={setDosageUnit}>
                <SelectTrigger id="edit-dosage-unit">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {DOSAGE_UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="edit-frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-duration">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="edit-duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-instruction">Instruction</Label>
            <Textarea
              id="edit-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. After meal"
              rows={2}
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {INSTRUCTION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setInstruction(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
