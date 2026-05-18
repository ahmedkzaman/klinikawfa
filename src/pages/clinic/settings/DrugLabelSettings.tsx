import { ArrowLeft, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  useDrugLabelSettings,
  useUpdateDrugLabelSettings,
  type DrugLabelSettings,
} from '@/hooks/clinic/useDrugLabelSettings';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { cn } from '@/lib/utils';
import { bento, bentoHeader, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

// Dummy patient / medication data — clinic identity is pulled live from
// `clinic_settings` (Settings → Clinic Profile) so the preview always
// matches what will actually print.
const PREVIEW_FILLER = {
  patient: 'Ali Bin Abu',
  ageGender: '34 / M',
  med: 'PARACETAMOL 500MG TABLET',
  qty: '10 Tab/s',
  expiry: '12/2027',
  duration: '5 Days',
  indication: 'FEVER',
  precaution: 'TAKE AFTER MEALS',
  instruction: '1 TABLET, 3X DAILY',
  date: '26/4/2026',
};

const REQUIRED_FIELDS = [
  { label: 'Clinic Name' },
  { label: 'Medication' },
  { label: 'Patient Details' },
  { label: 'Instruction' },
] as const;

type BooleanKeys = {
  [K in keyof DrugLabelSettings]: DrugLabelSettings[K] extends boolean ? K : never;
}[keyof DrugLabelSettings];

const TOGGLES: Array<{ key: BooleanKeys; label: string }> = [
  { key: 'show_address', label: 'Address' },
  { key: 'show_tel_number', label: 'Tel Number' },
  { key: 'show_precaution', label: 'Precaution' },
  { key: 'show_quantity', label: 'Quantity' },
  { key: 'show_date', label: 'Date' },
  { key: 'show_expiry_date', label: 'Expiry Date' },
  { key: 'show_duration', label: 'Duration' },
  { key: 'show_indication', label: 'Indication' },
];

export default function DrugLabelSettingsPage() {
  const { data: settings, isLoading } = useDrugLabelSettings();
  const update = useUpdateDrugLabelSettings();
  const { settings: clinic } = useClinicSettings();
  const clinicHeader = {
    name: clinic.clinic_name || 'Klinik Awfa',
    tel: clinic.phone || '',
    address: [clinic.address_line_1, clinic.address_line_2]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join(', '),
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 -ml-2">
            <Link to="/clinic/settings" aria-label="Back to Settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Drug Label</h1>
          <p className="text-sm text-slate-500">
            Choose which fields appear on printed medicine labels.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card className={bento}>
              <CardContent className="p-6">
                <h3 className={bentoHeader}>Label Properties</h3>
                {isLoading || !settings ? (
                  <div className="space-y-2">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {REQUIRED_FIELDS.map((f) => (
                      <PropertyRow
                        key={f.label}
                        label={f.label}
                        checked
                        disabled
                        badge={
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none text-[10px] h-5 px-1.5">
                            Required
                          </Badge>
                        }
                      />
                    ))}

                    <div className="my-2 border-t border-slate-100" />

                    {TOGGLES.map(({ key, label }) => (
                      <PropertyRow
                        key={key}
                        label={label}
                        checked={settings[key]}
                        onCheckedChange={(checked) =>
                          update.mutate({ [key]: !!checked } as ToggleablePatchAlias)
                        }
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={bento}>
              <CardContent className="p-6">
                <h3 className={bentoHeader}>Typography Scale (pt)</h3>
                {isLoading || !settings ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-5 pt-1">
                    <FontSizeRow
                      label="Clinic Name"
                      value={settings.font_size_clinic}
                      onCommit={(v) => update.mutate({ font_size_clinic: v })}
                    />
                    <FontSizeRow
                      label="Medicine Name"
                      value={settings.font_size_medicine}
                      onCommit={(v) => update.mutate({ font_size_medicine: v })}
                    />
                    <FontSizeRow
                      label="Instructions"
                      value={settings.font_size_instruction}
                      onCommit={(v) => update.mutate({ font_size_instruction: v })}
                    />
                    <p className="text-xs text-slate-400">
                      Adjust between 5–10pt in 0.5pt steps. Footer & address
                      text stay at their fixed sizes to protect the sticker
                      boundaries.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>


          <div className="lg:sticky lg:top-4 self-start">
            <Card className={cn(bento, 'bg-slate-50')}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={bentoHeader}>Drug Label Preview</h3>
                  <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-slate-500 hover:text-slate-900">
                    <Link to="/clinic/settings/clinic-profile">
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit clinic details
                    </Link>
                  </Button>
                </div>
                <LabelPreview settings={settings} clinic={clinicHeader} />
                <p className="mt-3 text-xs text-slate-400 text-center">
                  Approximate 60 × 50 mm thermal label preview. Clinic name,
                  address and phone come from{' '}
                  <Link to="/clinic/settings/clinic-profile" className="underline hover:text-slate-600">
                    Clinic Profile
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

type ToggleablePatchAlias = Partial<Omit<DrugLabelSettings, 'id' | 'updated_at'>>;

function PropertyRow({
  label,
  checked,
  disabled,
  badge,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
}) {
  const id = `dl-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors',
        !disabled && 'cursor-pointer hover:bg-slate-50',
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id} className={cn('cursor-pointer text-slate-700', disabled && 'cursor-default text-slate-500')}>
          {label}
        </Label>
      </span>
      {badge}
    </label>
  );
}

function FontSizeRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">{local.toFixed(1)} pt</span>
      </div>
      <Slider
        value={[local]}
        min={5}
        max={10}
        step={0.5}
        onValueChange={(v) => setLocal(v[0])}
        onValueCommit={(v) => onCommit(v[0])}
      />
    </div>
  );
}

function LabelPreview({
  settings,
  clinic,
}: {
  settings: DrugLabelSettings | null | undefined;
  clinic: { name: string; tel: string; address: string };
}) {
  const s = settings ?? {
    show_address: true,
    show_tel_number: true,
    show_precaution: true,
    show_quantity: true,
    show_date: true,
    show_expiry_date: true,
    show_duration: true,
    show_indication: true,
  };

  return (
    <div className="mx-auto w-full max-w-[360px]">
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden text-slate-900"
        style={{ aspectRatio: '60 / 50', fontFamily: 'ui-sans-serif, system-ui' }}
      >
        <div className="h-full w-full flex flex-col p-3 text-[10px] leading-tight">
          <div className="text-center">
            <div className="font-bold text-[12px] uppercase tracking-wide">{clinic.name}</div>
            {s.show_tel_number && clinic.tel && (
              <div className="text-[9px] text-slate-500">Tel: {clinic.tel}</div>
            )}
            {s.show_address && clinic.address && (
              <div className="text-[9px] text-slate-500 leading-snug mt-0.5">{clinic.address}</div>
            )}
          </div>

          <div className="border-t border-slate-200 my-2" />

          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-[11px] uppercase flex-1 leading-tight">{PREVIEW_FILLER.med}</div>
            <div className="text-right text-[9px] tabular-nums whitespace-nowrap">
              {s.show_quantity && <div>QTY: {PREVIEW_FILLER.qty}</div>}
              {s.show_expiry_date && <div>EXP: {PREVIEW_FILLER.expiry}</div>}
            </div>
          </div>

          <div className="text-center text-[10px] font-medium uppercase mt-2">{PREVIEW_FILLER.instruction}</div>
          {s.show_indication && (
            <div className="text-center text-[9px] text-slate-500 mt-0.5">For: {PREVIEW_FILLER.indication}</div>
          )}
          {s.show_precaution && (
            <div className="text-center text-[9px] italic text-slate-500 mt-0.5">{PREVIEW_FILLER.precaution}</div>
          )}

          <div className="flex-1" />
          <div className="border-t border-slate-200 my-2" />

          <div className="flex items-end justify-between gap-2">
            <div className="text-[9px]">
              <div className="font-semibold text-[10px]">{PREVIEW_FILLER.patient}</div>
              <div className="text-slate-500">{PREVIEW_FILLER.ageGender}</div>
              {s.show_duration && (
                <div className="text-slate-500 mt-0.5">Duration: {PREVIEW_FILLER.duration}</div>
              )}
            </div>
            {s.show_date && (
              <div className="text-[9px] text-slate-500 tabular-nums">Date: {PREVIEW_FILLER.date}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
