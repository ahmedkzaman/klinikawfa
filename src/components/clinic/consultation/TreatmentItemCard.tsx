import { useState } from 'react';
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
import { ComboboxInput } from '@/components/ui/combobox-input';
import {
  INDICATION_OPTIONS,
  DOSAGE_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  INSTRUCTION_OPTIONS,
  DURATION_OPTIONS,
  PRECAUTION_OPTIONS,
} from '@/lib/clinic/prescribingOptions';

export interface TreatmentItemCardItem {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
  price_tier?: string | null;
  dosage?: string | null;
  category: string;
  indication?: string | null;
  dosage_qty?: number | null;
  dosage_unit?: string | null;
  frequency?: string | null;
  instruction?: string | null;
  duration?: string | null;
  precaution?: string | null;
}

type ItemUpdate = {
  quantity: number;
  price: number;
  price_tier: string | null;
  indication: string | null;
  dosage_qty: number | null;
  dosage_unit: string | null;
  frequency: string | null;
  instruction: string | null;
  duration: string | null;
  precaution: string | null;
};

interface Props {
  item: TreatmentItemCardItem;
  onRemove: () => void;
  onSave: (updates: ItemUpdate) => void;
  priceTiers: string[];
  disabled?: boolean;
}

export function TreatmentItemCard({ item, onRemove, onSave, priceTiers, disabled = false }: Props) {
  const [qty, setQty] = useState(item.quantity);
  const [rate, setRate] = useState(Number(item.price));
  const [tier, setTier] = useState(item.price_tier ?? '');
  const [indication, setIndication] = useState(item.indication ?? '');
  const [dosageQty, setDosageQty] = useState<string>(
    item.dosage_qty != null ? String(item.dosage_qty) : '',
  );
  const [dosageUnit, setDosageUnit] = useState(item.dosage_unit ?? '');
  const [frequency, setFrequency] = useState(item.frequency ?? '');
  const [instruction, setInstruction] = useState(item.instruction ?? '');
  const [duration, setDuration] = useState(item.duration ?? '');
  const [precaution, setPrecaution] = useState(item.precaution ?? '');
  const [isActive, setIsActive] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const amount = qty * rate;

  if (!expanded) {
    return (
      <div
        className="rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center justify-between p-3">
          <div>
            <p className="text-sm font-bold uppercase">{item.item_name}</p>
            <p className="text-xs text-muted-foreground">
              {tier || 'No tier'}, RM {rate.toFixed(2)}
            </p>
          </div>
          <p className="text-sm font-semibold">RM {amount.toFixed(2)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b flex-wrap gap-2">
        <p
          className="text-sm font-bold uppercase cursor-pointer hover:text-primary"
          onClick={() => setExpanded(false)}
        >
          {item.item_name}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            Set as active medicine
          </label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
            onClick={onRemove}
          >
            Remove
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onSave({
                quantity: qty,
                price: rate,
                price_tier: tier || null,
                indication: indication || null,
                dosage_qty: dosageQty ? Number(dosageQty) : null,
                dosage_unit: dosageUnit || null,
                frequency: frequency || null,
                instruction: instruction || null,
                duration: duration || null,
                precaution: precaution || null,
              });
              setExpanded(false);
            }}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border-b">
        <div>
          <Label className="text-xs text-muted-foreground">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
            className="h-8 text-sm mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Price tier</Label>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              {priceTiers.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Rate (RM)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
            className="h-8 text-sm mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Amount (RM)</Label>
          <Input readOnly value={amount.toFixed(2)} className="h-8 text-sm mt-1 bg-muted" />
        </div>
      </div>

      {/* Dosage */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border-b">
        <div>
          <Label className="text-xs text-muted-foreground">Indication</Label>
          <ComboboxInput
            value={indication}
            onChange={setIndication}
            options={INDICATION_OPTIONS}
            placeholder="Type or select"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Dosage</Label>
          <div className="flex gap-1 mt-1">
            <Input
              type="number"
              min={0}
              value={dosageQty}
              onChange={(e) => setDosageQty(e.target.value)}
              className="h-8 text-sm w-16"
              placeholder="Qty"
            />
            <Select value={dosageUnit} onValueChange={setDosageUnit}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {DOSAGE_UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div />
      </div>

      {/* Instructions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
        <div>
          <Label className="text-xs text-muted-foreground">Instruction</Label>
          <ComboboxInput
            value={instruction}
            onChange={setInstruction}
            options={INSTRUCTION_OPTIONS}
            placeholder="Type or select"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Precaution</Label>
          <ComboboxInput
            value={precaution}
            onChange={setPrecaution}
            options={PRECAUTION_OPTIONS}
            placeholder="Type or select"
          />
        </div>
        <div />
      </div>
    </div>
  );
}
