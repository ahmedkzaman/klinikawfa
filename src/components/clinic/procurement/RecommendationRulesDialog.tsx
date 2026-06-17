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
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_THRESHOLDS,
  type RecommendationThresholds,
} from '@/hooks/clinic/useProcurementStats';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: RecommendationThresholds;
  onSave: (next: RecommendationThresholds) => void;
}

export function RecommendationRulesDialog({ open, onOpenChange, value, onSave }: Props) {
  const [draft, setDraft] = useState<RecommendationThresholds>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = <K extends keyof RecommendationThresholds>(k: K, v: number) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const handleSave = () => {
    onSave(draft);
    toast.success('Recommendation rules updated');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recommendation Rules</DialogTitle>
          <DialogDescription>
            Tune the thresholds that drive Urgent, Surge, and Overstock flags. Changes apply
            instantly and are saved to this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Field
            label="Urgent Reorder Buffer (Days)"
            help="Flag fast-moving items when days of cover fall below this number."
            min={1}
            max={30}
            step={1}
            value={draft.urgentDays}
            onChange={(v) => set('urgentDays', v)}
          />
          <Field
            label="Surge Trend Threshold (%)"
            help="Month-over-month case growth that counts as a surge."
            min={5}
            max={100}
            step={1}
            value={draft.surgeTrendPct}
            onChange={(v) => set('surgeTrendPct', v)}
          />
          <Field
            label="Surge Lift Threshold"
            help="Minimum lift score to treat an item as clinically correlated."
            min={1}
            max={5}
            step={0.1}
            value={draft.surgeLift}
            onChange={(v) => set('surgeLift', v)}
            decimals={1}
          />
          <Field
            label="Surge Days-Cover Limit"
            help="Trigger a surge warning only if stock cover falls below this."
            min={7}
            max={90}
            step={1}
            value={draft.surgeDaysCover}
            onChange={(v) => set('surgeDaysCover', v)}
          />
          <Field
            label="Dead-Stock Window (Days)"
            help="Informational. The 90-day window is enforced by the database view."
            min={30}
            max={180}
            step={1}
            value={draft.deadStockDays}
            onChange={(v) => set('deadStockDays', v)}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => setDraft(DEFAULT_THRESHOLDS)}
          >
            Reset to defaults
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  help,
  min,
  max,
  step,
  value,
  onChange,
  decimals = 0,
}: {
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        <Input
          type="number"
          className="w-24 h-8 text-right tabular-nums"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(Number(decimals ? v.toFixed(decimals) : v))}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
