import * as React from 'react';
import { Printer, RotateCcw, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';
import { usePrinterOffsets } from '@/hooks/clinic/usePrinterSettings';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import {
  generateDrugLabelPdf,
  type DrugLabelItem,
} from '@/lib/clinic/printDrugLabel';
import { useDrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';

const TEST_ITEM: DrugLabelItem = {
  item_name: 'TEST DRUG 500MG',
  quantity: 1,
  unit: 'TAB',
  indication: 'Alignment Test',
  dosage_qty: 1,
  dosage_unit: 'TABLET',
  frequency: 'TDS',
  duration: '1 Day',
  age_gender: '— / —',
};

export function PrinterCalibration() {
  const { offsetX, offsetY, setOffsets } = usePrinterOffsets();
  const { settings: clinic } = useClinicSettings();
  const { data: labelSettings } = useDrugLabelSettings();

  const [x, setX] = React.useState(String(offsetX));
  const [y, setY] = React.useState(String(offsetY));

  React.useEffect(() => setX(String(offsetX)), [offsetX]);
  React.useEffect(() => setY(String(offsetY)), [offsetY]);

  const parse = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const handleSave = () => {
    setOffsets({ offsetX: parse(x), offsetY: parse(y) });
    toast({ title: 'Calibration saved', description: 'Print a test label to verify.' });
  };

  const handleReset = () => {
    setOffsets({ offsetX: 0, offsetY: 0 });
    toast({ title: 'Calibration reset to 0' });
  };

  const handleTest = () => {
    // Persist current edits before printing so the PDF picks them up.
    setOffsets({ offsetX: parse(x), offsetY: parse(y) });
    const clinicInfo = {
      name: clinic.clinic_name || 'Klinik Awfa',
      phone: clinic.phone || '',
      addressFull: [clinic.address_line_1, clinic.address_line_2]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join(', '),
    };
    const url = generateDrugLabelPdf(
      [TEST_ITEM],
      'TEST ALIGNMENT',
      labelSettings ?? null,
      clinicInfo,
    );
    window.open(url, '_blank');
  };

  return (
    <Card className={bento}>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className={bentoHeader}>Printer Calibration</h3>
          <p className="text-xs text-slate-500 mt-1">
            Per-computer offsets (mm) for your 60 × 50 mm thermal sticker. Stored locally on this device.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="offset-x" className="text-slate-700">Horizontal Offset (mm)</Label>
            <Input
              id="offset-x"
              type="number"
              step="0.5"
              value={x}
              onChange={(e) => setX(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">+ pushes text right, − pushes left.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offset-y" className="text-slate-700">Vertical Offset (mm)</Label>
            <Input
              id="offset-y"
              type="number"
              step="0.5"
              value={y}
              onChange={(e) => setY(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">+ pushes text down, − pushes up.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={handleSave} size="sm">
            <Save className="h-4 w-4" />
            Save Calibration
          </Button>
          <Button onClick={handleTest} size="sm" variant="outline">
            <Printer className="h-4 w-4" />
            Print Test Label
          </Button>
          <Button onClick={handleReset} size="sm" variant="ghost">
            <RotateCcw className="h-4 w-4" />
            Reset to 0
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PrinterCalibration;
