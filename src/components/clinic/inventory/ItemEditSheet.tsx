import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Archive, RotateCcw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DOSAGE_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  FREQUENCY_LABELS,
  INSTRUCTION_OPTIONS,
  DURATION_UNIT_OPTIONS,
  PRECAUTION_OPTIONS,
} from '@/lib/clinic/prescribingOptions';
import {
  useAddInventoryItem,
  useUpdateInventoryItem,
  type InventoryCategory,
} from '@/hooks/clinic/useInventoryItems';
import { toast } from 'sonner';

export interface InventoryDashboardRow {
  id: string;
  name: string;
  category: InventoryCategory | string | null;
  stock: number;
  stock_amount_warning: number | null;
  price_to_patient_max: number;
  price_tier_1: number;
  price_tier_2: number;
  nearest_expiry_date: string | null;
  archived_at: string | null;
  groups: string | null;
  default_dosage_qty: string | null;
  default_dosage_unit: string | null;
  default_frequency: string | null;
  default_duration: string | null;
  default_duration_unit: string | null;
  default_instruction: string | null;
  default_precaution: string | null;
  status: string;
}

const CATEGORIES: InventoryCategory[] = ['Medication', 'Disposable Item', 'Vaccine', 'Other'];

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
  z.number().nonnegative('Must be 0 or more'),
);

const intField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
  z.number().int('Whole number').nonnegative('Must be 0 or more'),
);

const optStr = (max = 200) => z.string().trim().max(max).optional().or(z.literal(''));

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.enum(['Medication', 'Disposable Item', 'Vaccine', 'Other']),
  current_stock: intField,
  low_stock_threshold: intField,
  base_price: moneyField,
  price_tier_1: moneyField,
  price_tier_2: moneyField,
  expiry_date: optStr(20),
  drug_group: optStr(100),
  default_dosage_qty: optStr(50),
  default_dosage_unit: optStr(50),
  default_frequency: optStr(50),
  default_duration: optStr(50),
  default_duration_unit: optStr(50),
  default_instruction: optStr(200),
  default_precaution: optStr(500),
});

type FormData = z.infer<typeof schema>;

const EMPTY: FormData = {
  name: '',
  category: 'Medication',
  current_stock: 0,
  low_stock_threshold: 0,
  base_price: 0,
  price_tier_1: 0,
  price_tier_2: 0,
  expiry_date: '',
  drug_group: '',
  default_dosage_qty: '',
  default_dosage_unit: '',
  default_frequency: '',
  default_duration: '',
  default_duration_unit: '',
  default_instruction: '',
  default_precaution: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryDashboardRow | null;
}

export function ItemEditSheet({ open, onOpenChange, item }: Props) {
  const isEdit = !!item;
  const isArchived = !!item?.archived_at;
  const addItem = useAddInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const [archiveBusy, setArchiveBusy] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (item) {
      const validCats = CATEGORIES as string[];
      const cat = validCats.includes(item.category as string)
        ? (item.category as InventoryCategory)
        : 'Medication';
      reset({
        name: item.name,
        category: cat,
        current_stock: Number(item.stock) || 0,
        low_stock_threshold: Number(item.stock_amount_warning ?? 0) || 0,
        base_price: Number(item.price_to_patient_max) || 0,
        price_tier_1: Number(item.price_tier_1) || 0,
        price_tier_2: Number(item.price_tier_2) || 0,
        expiry_date: item.nearest_expiry_date ?? '',
        drug_group: item.groups ?? '',
        default_dosage_qty: item.default_dosage_qty ?? '',
        default_dosage_unit: item.default_dosage_unit ?? '',
        default_frequency: item.default_frequency ?? '',
        default_duration: item.default_duration ?? '',
        default_duration_unit: item.default_duration_unit ?? '',
        default_instruction: item.default_instruction ?? '',
        default_precaution: item.default_precaution ?? '',
      });
    } else {
      reset(EMPTY);
    }
  }, [open, item, reset]);

  const category = watch('category');
  const showClinical = category === 'Medication';
  const submitting = addItem.isPending || updateItem.isPending;

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = {
        name: data.name,
        category: data.category,
        cost_price: 0, // unchanged in this sheet
        selling_price: data.base_price,
        standard_panel_price: 0, // unchanged in this sheet
        current_stock: data.current_stock,
        status: 'active' as const,
        low_stock_threshold: data.low_stock_threshold,
        price_tier_1: data.price_tier_1,
        price_tier_2: data.price_tier_2,
        expiry_date: data.expiry_date || null,
        drug_group: showClinical ? data.drug_group || null : null,
        default_dosage_qty: showClinical ? data.default_dosage_qty || null : null,
        default_dosage_unit: showClinical ? data.default_dosage_unit || null : null,
        default_frequency: showClinical ? data.default_frequency || null : null,
        default_duration: showClinical ? data.default_duration || null : null,
        default_duration_unit: showClinical ? data.default_duration_unit || null : null,
        default_instruction: showClinical ? data.default_instruction || null : null,
        default_precaution: showClinical ? data.default_precaution || null : null,
      };

      if (isEdit && item) {
        // Don't overwrite cost_price/standard_panel_price if not edited here
        const { cost_price, standard_panel_price, ...rest } = payload;
        void cost_price;
        void standard_panel_price;
        await updateItem.mutateAsync({ id: item.id, ...rest });
        toast.success('Item updated');
      } else {
        await addItem.mutateAsync(payload);
        toast.success('Item added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item');
    }
  });

  const handleArchive = async () => {
    if (!item) return;
    setArchiveBusy(true);
    try {
      await updateItem.mutateAsync({
        id: item.id,
        archived_at: isArchived ? null : new Date().toISOString(),
      });
      toast.success(isArchived ? 'Item restored' : 'Item archived');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive item');
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Item' : 'Add Item'}</SheetTitle>
          <SheetDescription>
            Manage stock levels, pricing tiers, and clinical defaults.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Column 1: Item & Pricing ── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Item & Pricing
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="e.g. Paracetamol 500mg" {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setValue('category', v as InventoryCategory)}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current_stock">Current Stock</Label>
                  <Input id="current_stock" type="number" min="0" step="1" {...register('current_stock')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="low_stock_threshold">Low Stock Alert</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    min="0"
                    step="1"
                    {...register('low_stock_threshold')}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="base_price">Base Price (RM)</Label>
                <Input id="base_price" type="number" min="0" step="0.01" {...register('base_price')} />
                <p className="text-xs text-muted-foreground">Self-pay / walk-in price.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="price_tier_1">Tier 1 Price (RM)</Label>
                  <Input id="price_tier_1" type="number" min="0" step="0.01" {...register('price_tier_1')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price_tier_2">Tier 2 Price (RM)</Label>
                  <Input id="price_tier_2" type="number" min="0" step="0.01" {...register('price_tier_2')} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expiry_date">Expiry Date</Label>
                <Input id="expiry_date" type="date" {...register('expiry_date')} />
              </div>
            </div>

            {/* ── Column 2: Clinical Rules (Medication only) ── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Clinical Rules
              </h3>

              {!showClinical ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                  Clinical defaults only apply to <strong>Medication</strong> items. Switch the
                  category on the left to enable this section.
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="drug_group">Drug Group</Label>
                    <Input
                      id="drug_group"
                      placeholder="e.g. Antibiotic, Analgesic"
                      {...register('drug_group')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="default_dosage_qty">Dosage</Label>
                      <Input
                        id="default_dosage_qty"
                        placeholder="e.g. 1, 2, 5"
                        {...register('default_dosage_qty')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="default_dosage_unit">Dosage Unit</Label>
                      <Select
                        value={watch('default_dosage_unit') || ''}
                        onValueChange={(v) => setValue('default_dosage_unit', v)}
                      >
                        <SelectTrigger id="default_dosage_unit">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOSAGE_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="default_frequency">Frequency</Label>
                    <Select
                      value={watch('default_frequency') || ''}
                      onValueChange={(v) => setValue('default_frequency', v)}
                    >
                      <SelectTrigger id="default_frequency">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            <span className="font-medium">{f}</span>
                            <span className="text-muted-foreground ml-2">{FREQUENCY_LABELS[f] || ''}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="default_duration">Duration</Label>
                      <Input
                        id="default_duration"
                        placeholder="e.g. 5, 7, 14"
                        {...register('default_duration')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="default_duration_unit">Duration Unit</Label>
                      <Select
                        value={watch('default_duration_unit') || ''}
                        onValueChange={(v) => setValue('default_duration_unit', v)}
                      >
                        <SelectTrigger id="default_duration_unit">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="default_instruction">Instructions</Label>
                    <Select
                      value={watch('default_instruction') || ''}
                      onValueChange={(v) => setValue('default_instruction', v)}
                    >
                      <SelectTrigger id="default_instruction">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {INSTRUCTION_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="default_precaution">Precautions</Label>
                    <Select
                      value={watch('default_precaution') || ''}
                      onValueChange={(v) => setValue('default_precaution', v)}
                    >
                      <SelectTrigger id="default_precaution">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRECAUTION_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </div>

          <SheetFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-4 border-t">
            {isEdit ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant={isArchived ? 'outline' : 'destructive'}
                    disabled={archiveBusy || submitting}
                  >
                    {isArchived ? (
                      <><RotateCcw className="mr-1.5 h-4 w-4" /> Restore Item</>
                    ) : (
                      <><Archive className="mr-1.5 h-4 w-4" /> Archive Item</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {isArchived ? 'Restore this item?' : 'Archive this item?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {isArchived
                        ? 'The item will become available again in the active inventory.'
                        : 'Archiving hides the item from active inventory but keeps its history. You can restore it later from the Archived tab.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive}>
                      {isArchived ? 'Restore' : 'Archive'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : <span />}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Item'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
