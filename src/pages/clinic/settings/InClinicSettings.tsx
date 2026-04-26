import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useClinicPreferences, useUpdateClinicPreference } from '@/hooks/clinic/useClinicPreferences';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { bento, bentoHeader, pageInner, pageShell, primaryBtn, secondaryBtn, softInput } from '@/lib/clinic/bentoTokens';

const PREF_FEE_NAME = 'default_consultation_fee_name';
const PREF_FEE_PRICE = 'default_consultation_fee_price';

const DEFAULTS = {
  [PREF_FEE_NAME]: 'Consultation',
  [PREF_FEE_PRICE]: '0',
};

interface FormState {
  [PREF_FEE_NAME]: string;
  [PREF_FEE_PRICE]: string;
}

export default function InClinicSettings() {
  const { isLoading, getPreference } = useClinicPreferences();
  const updatePref = useUpdateClinicPreference();

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (isLoading || initial) return;
    const seeded: FormState = {
      [PREF_FEE_NAME]: getPreference(PREF_FEE_NAME, DEFAULTS[PREF_FEE_NAME]),
      [PREF_FEE_PRICE]: getPreference(PREF_FEE_PRICE, DEFAULTS[PREF_FEE_PRICE]),
    };
    setInitial(seeded);
    setForm(seeded);
  }, [isLoading, initial, getPreference]);

  const dirtyKeys = useMemo<Array<keyof FormState>>(() => {
    if (!form || !initial) return [];
    return (Object.keys(form) as Array<keyof FormState>).filter(
      (k) => form[k] !== initial[k],
    );
  }, [form, initial]);

  const isDirty = dirtyKeys.length > 0;

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleCancel = () => {
    if (initial) setForm(initial);
  };

  const handleSave = async () => {
    if (!form || dirtyKeys.length === 0) return;
    try {
      await Promise.all(
        dirtyKeys.map((key) =>
          updatePref.mutateAsync({ key, value: form[key] }),
        ),
      );
      setInitial(form);
      toast.success('Preferences saved');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save preferences');
    }
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="max-w-2xl space-y-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
              <Link to="/clinic/settings">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Settings
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">General Preferences</h1>
            <p className="text-sm text-slate-500">
              Defaults applied when creating new consultations.
            </p>
          </div>

          <Card className={bento}>
            <CardContent className="p-6 space-y-5">
              <h3 className={bentoHeader}>Default Consultation Fee</h3>
              {isLoading || !form ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fee-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Fee Name
                    </Label>
                    <Input
                      id="fee-name"
                      value={form[PREF_FEE_NAME]}
                      onChange={(e) => handleChange(PREF_FEE_NAME, e.target.value)}
                      placeholder="e.g. Consultation"
                      className={softInput}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fee-price" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Fee Price (RM)
                    </Label>
                    <Input
                      id="fee-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form[PREF_FEE_PRICE]}
                      onChange={(e) => handleChange(PREF_FEE_PRICE, e.target.value)}
                      placeholder="0.00"
                      className={softInput}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      onClick={handleCancel}
                      disabled={!isDirty || updatePref.isPending}
                      className={secondaryBtn}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!isDirty || updatePref.isPending}
                      className={primaryBtn}
                    >
                      {updatePref.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
