import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import {
  budgetCategoryLabel,
  budgetCategoryList,
  type BudgetCategory,
} from '@/lib/clinic/procurementDashboard';
import { useSaveProcurementBudgets } from '@/hooks/clinic/useProcurementBudgets';

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  currentBudgets: Record<BudgetCategory, number>;
}

function formatMYR(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
}

/**
 * Management-only monthly category budget editor. Submits all four rows in a
 * single mutation; stays open with an inline error when saving fails.
 */
export function BudgetDialog({ open, onOpenChange, month, currentBudgets }: BudgetDialogProps) {
  const [values, setValues] = useState<Record<BudgetCategory, string>>({
    medicines: '',
    consumables: '',
    vaccines: '',
    other: '',
  });
  const [inlineError, setInlineError] = useState<string | null>(null);
  const { saveBudgets } = useSaveProcurementBudgets(month);

  useEffect(() => {
    if (open) {
      setValues({
        medicines: String(currentBudgets.medicines ?? 0),
        consumables: String(currentBudgets.consumables ?? 0),
        vaccines: String(currentBudgets.vaccines ?? 0),
        other: String(currentBudgets.other ?? 0),
      });
      setInlineError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month]);

  const parseAmount = (raw: string): number | null => {
    const trimmed = raw.trim().replace(/,/g, '');
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSubmit = () => {
    const budgets = {} as Record<BudgetCategory, number>;
    for (const category of budgetCategoryList()) {
      const parsed = parseAmount(values[category]);
      if (parsed === null) {
        setInlineError('Enter a valid amount for every category (0 is allowed).');
        return;
      }
      if (parsed < 0) {
        setInlineError('Budget amounts cannot be negative.');
        return;
      }
      budgets[category] = parsed;
    }

    setInlineError(null);
    saveBudgets.mutate(
      { budgets, updatedBy: crypto.randomUUID() },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error: Error) =>
          setInlineError(error.message || 'Saving the budgets failed. Please try again.'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Monthly budget</DialogTitle>
          <DialogDescription>
            Set the category budgets for {month}. Management approval permission required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {budgetCategoryList().map((category) => (
            <div key={category} className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor={`budget-${category}`} className="text-right text-sm">
                {budgetCategoryLabel(category)}
              </Label>
              <div className="col-span-3 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RM</span>
                <Input
                  id={`budget-${category}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="pl-10"
                  value={values[category]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [category]: e.target.value }))}
                />
              </div>
            </div>
          ))}

          {inlineError && (
            <p role="alert" className="text-sm text-destructive">
              {inlineError}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Current totals: {formatMYR(budgetCategoryList().reduce((sum, c) => sum + (Number(currentBudgets[c]) || 0), 0))}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveBudgets.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saveBudgets.isPending}>
            {saveBudgets.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save budgets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
