import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Zap, TrendingUp, CalendarRange } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { bento, pageInner, pageShell, primaryBtn } from '@/lib/clinic/bentoTokens';

type FormState = {
  procurement_urgent_days: number;
  procurement_surge_trend: number;
  procurement_surge_lift: number;
  procurement_surge_days_cover: number;
  forecast_top_diagnoses: number;
  forecast_top_items: number;
};

const DEFAULT_FORM: FormState = {
  procurement_urgent_days: 7,
  procurement_surge_trend: 20,
  procurement_surge_lift: 1.5,
  procurement_surge_days_cover: 30,
  forecast_top_diagnoses: 5,
  forecast_top_items: 3,
};

export default function ProcurementSettings() {
  const { settings, isLoading, update } = useClinicSettings();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && settings?.id) {
      setForm({
        procurement_urgent_days: settings.procurement_urgent_days ?? 7,
        procurement_surge_trend: Number(settings.procurement_surge_trend ?? 20),
        procurement_surge_lift: Number(settings.procurement_surge_lift ?? 1.5),
        procurement_surge_days_cover: settings.procurement_surge_days_cover ?? 30,
        forecast_top_diagnoses: settings.forecast_top_diagnoses ?? 5,
        forecast_top_items: settings.forecast_top_items ?? 3,
      });
      setHydrated(true);
    }
  }, [settings, hydrated]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const onSave = () => {
    update.mutate(form, {
      onSuccess: () => toast.success('Procurement rules saved'),
      onError: (e: any) => toast.error(e?.message ?? 'Save failed'),
    });
  };

  if (isLoading) {
    return (
      <div className={pageShell}>
        <div className={pageInner}>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Procurement &amp; Forecasting
          </h1>
          <p className="text-sm text-slate-500">
            Global thresholds used across all automated purchase recommendations and
            seasonal readiness forecasts.
          </p>
        </div>

        {/* Section 1 — Reorder & Surge */}
        <Card className={`${bento} p-6 space-y-6`}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-destructive/10 text-destructive p-2.5">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Reorder &amp; Surge Rules</h2>
              <p className="text-sm text-slate-500">
                Controls the &quot;Urgent Reorder&quot; and &quot;Seasonal Demand Surge&quot;
                signals on the Procurement Dashboard.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Urgent Days Buffer</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {form.procurement_urgent_days} days
                </span>
              </div>
              <Slider
                min={1}
                max={30}
                step={1}
                value={[form.procurement_urgent_days]}
                onValueChange={([v]) => set('procurement_urgent_days', v)}
              />
              <p className="text-xs text-muted-foreground">
                Flag an item as &quot;Urgent Reorder&quot; when days-of-cover falls below this number.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Surge Trend %</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {form.procurement_surge_trend}%
                </span>
              </div>
              <Slider
                min={5}
                max={100}
                step={1}
                value={[form.procurement_surge_trend]}
                onValueChange={([v]) => set('procurement_surge_trend', v)}
              />
              <p className="text-xs text-muted-foreground">
                Minimum month-on-month case growth that qualifies as a seasonal surge.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Surge Lift Threshold</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {form.procurement_surge_lift.toFixed(2)}×
                </span>
              </div>
              <Slider
                min={1}
                max={5}
                step={0.1}
                value={[form.procurement_surge_lift]}
                onValueChange={([v]) => set('procurement_surge_lift', Number(v.toFixed(2)))}
              />
              <p className="text-xs text-muted-foreground">
                Statistical lift score required to associate a diagnosis with an inventory
                item.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="surge-cover">Surge Days Cover</Label>
              <Input
                id="surge-cover"
                type="number"
                min={1}
                max={120}
                value={form.procurement_surge_days_cover}
                onChange={(e) =>
                  set('procurement_surge_days_cover', Math.max(1, Number(e.target.value) || 1))
                }
              />
              <p className="text-xs text-muted-foreground">
                Surge alerts only fire when stock cover is below this many days.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 2 — Seasonal Forecasting */}
        <Card className={`${bento} p-6 space-y-6`}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 text-blue-600 p-2.5">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Seasonal Forecasting</h2>
              <p className="text-sm text-slate-500">
                Controls the depth of projection shown on the Seasonal Readiness page.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Top Diagnoses to Project</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {form.forecast_top_diagnoses}
                </span>
              </div>
              <Slider
                min={3}
                max={15}
                step={1}
                value={[form.forecast_top_diagnoses]}
                onValueChange={([v]) => set('forecast_top_diagnoses', v)}
              />
              <p className="text-xs text-muted-foreground">
                Number of diagnosis groups to chart and forecast for the target month.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Correlated Items per Diagnosis</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {form.forecast_top_items}
                </span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[form.forecast_top_items]}
                onValueChange={([v]) => set('forecast_top_items', v)}
              />
              <p className="text-xs text-muted-foreground">
                How many high-confidence inventory items to list under each forecasted diagnosis.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={onSave}
            disabled={update.isPending}
            className={primaryBtn}
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
