import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDrugLabelSettings,
  useUpdateDrugLabelSettings,
  type DrugLabelSettings,
} from '@/hooks/clinic/useDrugLabelSettings';
import { cn } from '@/lib/utils';

// Placeholder data used in the live preview pane. The real label rendering
// will happen at print time from `consultation_items` — these constants
// exist only so the configuration UI looks meaningful.
const PREVIEW = {
  clinic: 'Klinik Awfa',
  tel: '+60 18-252 3531',
  address: 'B2 & B4, Jalan IM 16/1, Kota SAS, 25200 Kuantan, Pahang',
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

const TOGGLES: Array<{ key: keyof Omit<DrugLabelSettings, 'id' | 'updated_at'>; label: string }> = [
  { key: 'show_address', label: 'Address' },
  { key: 'show_tel_number', label: 'Tel Number' },
  { key: 'show_precaution', label: 'Precaution' },
  { key: 'show_quantity', label: 'Quantity' },
  { key: 'show_date', label: 'Date' },
  { key: 'show_expiry_date', label: 'Expiry Date' },
  { key: 'show_duration', label: 'Duration' },
  { key: 'show_indication', label: 'Indication' },
];

export default function DrugLabelSettings() {
  const { data: settings, isLoading } = useDrugLabelSettings();
  const update = useUpdateDrugLabelSettings();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          to="/clinic/settings"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Back to Settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drug Label</h1>
          <p className="text-sm text-muted-foreground">
            Choose which fields appear on printed medicine labels.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Properties */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Label Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading || !settings ? (
              <div className="space-y-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Required (always on) */}
                {REQUIRED_FIELDS.map((f) => (
                  <PropertyRow
                    key={f.label}
                    label={f.label}
                    checked
                    disabled
                    badge={
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        Required
                      </Badge>
                    }
                  />
                ))}

                {/* Toggleable */}
                <div className="my-2 border-t" />

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
              </>
            )}
          </CardContent>
        </Card>

        {/* Right — Live Preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base">Drug Label Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <LabelPreview settings={settings} />
              <p className="mt-3 text-xs text-muted-foreground text-center">
                Approximate 60 × 50 mm thermal label preview.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Re-declare locally so we don't have to export it from the hook file just
// for a single onCheckedChange handler.
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
        'flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors',
        !disabled && 'cursor-pointer hover:bg-muted/50',
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
        <Label htmlFor={id} className={cn('cursor-pointer', disabled && 'cursor-default')}>
          {label}
        </Label>
      </span>
      {badge}
    </label>
  );
}

function LabelPreview({ settings }: { settings: DrugLabelSettings | null | undefined }) {
  // Until settings load, render with everything visible (matches the DB
  // defaults) so the user doesn't see the preview "build up".
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
        className="bg-white rounded-md border border-border shadow-sm overflow-hidden text-foreground"
        style={{ aspectRatio: '60 / 50', fontFamily: 'ui-sans-serif, system-ui' }}
      >
        <div className="h-full w-full flex flex-col p-3 text-[10px] leading-tight">
          {/* Header */}
          <div className="text-center">
            <div className="font-bold text-[12px] uppercase tracking-wide">
              {PREVIEW.clinic}
            </div>
            {s.show_tel_number && (
              <div className="text-[9px] text-muted-foreground">Tel: {PREVIEW.tel}</div>
            )}
            {s.show_address && (
              <div className="text-[9px] text-muted-foreground leading-snug mt-0.5">
                {PREVIEW.address}
              </div>
            )}
          </div>

          <div className="border-t border-border my-2" />

          {/* Mid — medication */}
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-[11px] uppercase flex-1 leading-tight">
              {PREVIEW.med}
            </div>
            <div className="text-right text-[9px] tabular-nums whitespace-nowrap">
              {s.show_quantity && <div>QTY: {PREVIEW.qty}</div>}
              {s.show_expiry_date && <div>EXP: {PREVIEW.expiry}</div>}
            </div>
          </div>

          {/* Instruction */}
          <div className="text-center text-[10px] font-medium uppercase mt-2">
            {PREVIEW.instruction}
          </div>
          {s.show_indication && (
            <div className="text-center text-[9px] text-muted-foreground mt-0.5">
              For: {PREVIEW.indication}
            </div>
          )}
          {s.show_precaution && (
            <div className="text-center text-[9px] italic text-muted-foreground mt-0.5">
              {PREVIEW.precaution}
            </div>
          )}

          {/* Spacer pushes footer down */}
          <div className="flex-1" />

          <div className="border-t border-border my-2" />

          {/* Footer */}
          <div className="flex items-end justify-between gap-2">
            <div className="text-[9px]">
              <div className="font-semibold text-[10px]">{PREVIEW.patient}</div>
              <div className="text-muted-foreground">{PREVIEW.ageGender}</div>
              {s.show_duration && (
                <div className="text-muted-foreground mt-0.5">
                  Duration: {PREVIEW.duration}
                </div>
              )}
            </div>
            {s.show_date && (
              <div className="text-[9px] text-muted-foreground tabular-nums">
                Date: {PREVIEW.date}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
