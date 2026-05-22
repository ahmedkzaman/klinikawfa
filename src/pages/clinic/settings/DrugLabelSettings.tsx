import * as React from 'react';
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
import {
  generateDrugLabelPdf,
  type DrugLabelItem,
} from '@/lib/clinic/printDrugLabel';
import { PrinterCalibration } from '@/components/clinic/settings/PrinterCalibration';


const PREVIEW_PATIENT = 'Ali Bin Abu';
const PREVIEW_ITEM: DrugLabelItem = {
  item_name: 'Paracetamol 500mg Tablet',
  quantity: 10,
  indication: 'Fever',
  dosage_qty: 1,
  dosage_unit: 'TABLET',
  frequency: 'TDS',
  instruction: '1 TABLET, 3X DAILY',
  duration: '5 Days',
  precaution: 'Take after meals',
  age_gender: '34 / M',
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
  const clinicInfo = {
    name: clinic.clinic_name || 'Klinik Awfa',
    phone: clinic.phone || '',
    addressFull: [clinic.address_line_1, clinic.address_line_2]
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


          <div className="lg:sticky lg:top-4 self-start space-y-4">

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
                <LabelPreview settings={settings} clinic={clinicInfo} />
                <p className="mt-3 text-xs text-slate-400 text-center">
                  Live 60 × 50 mm PDF preview using the same layout as printed labels. Clinic name,
                  address and phone come from{' '}
                  <Link to="/clinic/settings/clinic-profile" className="underline hover:text-slate-600">
                    Clinic Profile
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
            <PrinterCalibration />
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
  clinic: { name: string; phone: string; addressFull: string };
}) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!settings) return;
    const blobUrl = generateDrugLabelPdf(
      [PREVIEW_ITEM],
      PREVIEW_PATIENT,
      settings,
      clinic,
    );
    setUrl(blobUrl);
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [
    settings,
    clinic.name,
    clinic.phone,
    clinic.addressFull,
  ]);

  return (
    <div className="mx-auto w-full max-w-[360px]">
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ aspectRatio: '60 / 50' }}
      >
        {url ? (
          <iframe
            key={url}
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
            title="Drug label preview"
            className="w-full h-full border-0"
          />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
