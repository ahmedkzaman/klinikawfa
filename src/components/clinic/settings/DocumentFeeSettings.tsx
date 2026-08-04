import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import {
  type DocumentFeeType,
  useClinicDocumentFees,
  useSetClinicDocumentFee,
} from '@/hooks/clinic/useClinicDocumentFees';

const feeSettings: Array<{ type: DocumentFeeType; label: string; help: string }> = [
  {
    type: 'mc',
    label: 'Medical Certificate',
    help: 'Clinic staff and doctors may update this fee.',
  },
  {
    type: 'prescription',
    label: 'Prescription Slip',
    help: 'Only administrators may update this fee.',
  },
  {
    type: 'referral',
    label: 'Referral Letter',
    help: 'Only administrators may update this fee.',
  },
  {
    type: 'quarantine',
    label: 'Quarantine Letter',
    help: 'Only administrators may update this fee.',
  },
];

const mcEditors: AppRole[] = [
  'ops_staff',
  'operations',
  'staff',
  'resident_doctor',
  'admin',
  'doctor_admin',
];

const adminEditors: AppRole[] = ['admin', 'doctor_admin'];
const MAX_FEE = 99_999_999.99;
const invalidAmountMessage =
  'Enter an amount from RM0.00 to RM99,999,999.99 with up to 2 decimal places.';
const emptyFees: never[] = [];

function canEditFee(role: AppRole | null, type: DocumentFeeType) {
  return type === 'mc' ? mcEditors.includes(role as AppRole) : adminEditors.includes(role as AppRole);
}

function validateAmount(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return invalidAmountMessage;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_FEE ? null : invalidAmountMessage;
}

function formatAmount(amount: number | undefined) {
  return `RM${(amount ?? 0).toFixed(2)}`;
}

export function DocumentFeeSettings() {
  const { role } = useAuth();
  const { data, isLoading, error: loadError } = useClinicDocumentFees();
  const fees = data ?? emptyFees;
  const setFee = useSetClinicDocumentFee();
  const [drafts, setDrafts] = useState<Partial<Record<DocumentFeeType, string>>>({});
  const [validationErrors, setValidationErrors] = useState<Partial<Record<DocumentFeeType, string>>>({});

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const fee of fees) {
        if (next[fee.documentType] === undefined) next[fee.documentType] = fee.amount.toFixed(2);
      }
      return next;
    });
  }, [fees]);

  const feeFor = (type: DocumentFeeType) => fees.find((fee) => fee.documentType === type)?.amount;

  const updateDraft = (type: DocumentFeeType, value: string) => {
    setDrafts((current) => ({ ...current, [type]: value }));
    const validationError = validateAmount(value);
    setValidationErrors((current) => ({ ...current, [type]: validationError ?? undefined }));
  };

  const save = (type: DocumentFeeType) => {
    const value = drafts[type] ?? '';
    const validationError = validateAmount(value);
    if (validationError) {
      setValidationErrors((current) => ({ ...current, [type]: validationError }));
      return;
    }

    setFee.mutate({ documentType: type, amount: Number(value) });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="document-fee-settings-title">
      <div className="mb-3">
        <h2 id="document-fee-settings-title" className="text-sm font-semibold text-slate-900">
          Official document fees
        </h2>
        <p className="text-xs text-slate-500">
          These fees are charged when an official document is issued.
        </p>
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">{loadError.message}</p>
      ) : isLoading ? (
        <p className="text-sm text-slate-500">Loading document fees…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {feeSettings.map(({ type, label, help }) => {
            const editable = canEditFee(role, type);
            const draft = drafts[type] ?? feeFor(type)?.toFixed(2) ?? '';
            const validationError = validationErrors[type];

            return (
              <div key={type} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={`${type}-fee`} className="text-sm font-medium">{label} fee</Label>
                  <span className="text-sm font-semibold text-slate-900">{formatAmount(Number(draft))}</span>
                </div>
                <Input
                  id={`${type}-fee`}
                  aria-label={`${label} fee`}
                  type="number"
                  min="0"
                  max={MAX_FEE}
                  step="0.01"
                  inputMode="decimal"
                  value={draft}
                  disabled={!editable || setFee.isPending}
                  aria-invalid={Boolean(validationError)}
                  onChange={(event) => updateDraft(type, event.target.value)}
                />
                <p className="min-h-8 text-xs text-slate-500">{help}</p>
                {validationError && <p role="alert" className="text-xs text-destructive">{validationError}</p>}
                <Button
                  size="sm"
                  className="w-full"
                  aria-label={`Save ${label} fee`}
                  disabled={!editable || Boolean(validationError) || setFee.isPending || !draft}
                  onClick={() => save(type)}
                >
                  {setFee.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {setFee.error && <p role="alert" className="mt-3 text-sm text-destructive">{setFee.error.message}</p>}
    </section>
  );
}
