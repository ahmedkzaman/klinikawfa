import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type PanelClaimPortionDraft,
  parseMoneyInput,
  summarizePortions,
} from '@/lib/clinic/panelClaimPortions';
import {
  bento,
  bentoHeader,
  fieldLabel,
  primaryBtn,
  secondaryBtn,
  softInput,
  softTile,
} from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';

export interface PanelClaimPortionInput {
  amount: number;
  remark: string;
}

interface PanelClaimPortionEditorRow extends PanelClaimPortionDraft {
  id: string;
}

interface PanelClaimPortionEditorProps {
  claimAmount: number;
  initialPortions: PanelClaimPortionDraft[];
  /** Change this stable value to intentionally replace the current draft rows. */
  resetKey?: string | number;
  disabled?: boolean;
  onConfirm: (portions: PanelClaimPortionInput[]) => void;
  onCancel: () => void;
}

function formatRM(value: number): string {
  return `RM ${value.toFixed(2)}`;
}

function createRows(
  portions: PanelClaimPortionDraft[],
  nextRowId: React.MutableRefObject<number>,
): PanelClaimPortionEditorRow[] {
  return portions.map((portion) => ({
    ...portion,
    id: `panel-claim-portion-${nextRowId.current++}`,
  }));
}

export function PanelClaimPortionEditor({
  claimAmount,
  initialPortions,
  resetKey,
  disabled = false,
  onConfirm,
  onCancel,
}: PanelClaimPortionEditorProps) {
  const nextRowId = useRef(0);
  const initialPortionsRef = useRef(initialPortions);
  const previousResetKey = useRef(resetKey);
  const [portions, setPortions] = useState<PanelClaimPortionEditorRow[]>(() => (
    createRows(initialPortions, nextRowId)
  ));

  initialPortionsRef.current = initialPortions;

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setPortions(createRows(initialPortionsRef.current, nextRowId));
  }, [resetKey]);

  const summary = useMemo(
    () => summarizePortions(portions, claimAmount),
    [claimAmount, portions],
  );
  const hasMalformedAmount = portions.some((portion) => parseMoneyInput(portion.amount) === null);
  const requiresMorePortions = portions.length < 2;

  function updatePortion(index: number, patch: Partial<PanelClaimPortionDraft>) {
    setPortions((current) => current.map((portion, currentIndex) => (
      currentIndex === index ? { ...portion, ...patch } : portion
    )));
  }

  function addPortion() {
    setPortions((current) => [...current, ...createRows([{ amount: '', remark: '' }], nextRowId)]);
  }

  function removePortion(index: number) {
    setPortions((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleConfirm() {
    if (!summary.valid) return;
    onConfirm(portions.map((portion) => ({
      amount: parseMoneyInput(portion.amount)!,
      remark: portion.remark,
    })));
  }

  return (
    <div className={cn(bento, 'w-full p-4 sm:p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={cn(bentoHeader, 'mb-1')}>Payment portions</h2>
          <p className="text-sm text-slate-500">Split the claim across payment approvals.</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg"
                aria-label="Add portion"
                disabled={disabled}
                onClick={addPortion}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add portion</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-4 space-y-3">
        {portions.map((portion, index) => {
          const portionNumber = index + 1;
          const amountInvalid = parseMoneyInput(portion.amount) === null;

          return (
            <div key={portion.id} className="grid min-h-28 grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(10rem,12rem)_1fr_auto] sm:items-start">
              <div className="space-y-1.5">
                <Label htmlFor={`portion-${portion.id}-amount`} className={fieldLabel}>
                  Portion {portionNumber} amount (RM)
                </Label>
                <Input
                  id={`portion-${portion.id}-amount`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={portion.amount}
                  onChange={(event) => updatePortion(index, { amount: event.target.value })}
                  disabled={disabled}
                  aria-invalid={amountInvalid}
                  className={cn(softInput, 'h-10 tabular-nums', amountInvalid && 'border-rose-400 bg-rose-50 focus-visible:border-rose-500')}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`portion-${portion.id}-remark`} className={fieldLabel}>
                  Portion {portionNumber} remarks
                </Label>
                <Textarea
                  id={`portion-${portion.id}-remark`}
                  value={portion.remark}
                  onChange={(event) => updatePortion(index, { remark: event.target.value })}
                  disabled={disabled}
                  rows={2}
                  className={cn(softInput, 'min-h-10 resize-y')}
                  placeholder="Optional remark"
                />
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 self-end rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 sm:self-start"
                      aria-label={`Remove portion ${portionNumber}`}
                      disabled={disabled}
                      onClick={() => removePortion(index)}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove portion {portionNumber}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={softTile}>
          <div className={fieldLabel}>Allocated</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatRM(summary.allocated)}</div>
        </div>
        <div className={cn(softTile, summary.remaining === 0 ? 'bg-emerald-50' : 'bg-amber-50')}>
          <div className={fieldLabel}>Remaining</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatRM(summary.remaining)}</div>
        </div>
      </div>

      {!summary.valid && (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {hasMalformedAmount
            ? 'Enter a positive amount with up to two decimal places.'
            : requiresMorePortions
              ? 'Add at least two portions before confirming.'
              : 'Portions must add up exactly to the claim amount.'}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className={primaryBtn}
          disabled={disabled || !summary.valid}
          onClick={handleConfirm}
        >
          Confirm portions
        </Button>
      </div>
    </div>
  );
}
