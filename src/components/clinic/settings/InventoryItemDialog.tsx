import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { ComboboxInput } from '@/components/ui/combobox-input';
import {
  INDICATION_OPTIONS,
  DOSAGE_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  INSTRUCTION_OPTIONS,
  DURATION_UNIT_OPTIONS,
  PRECAUTION_OPTIONS,
} from '@/lib/clinic/prescribingOptions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  useAddInventoryItem,
  useUpdateInventoryItem,
} from '@/hooks/clinic/useInventoryItems';
import {
  usePriceOverridesForItem,
  useReconcileOverrides,
  useActivePanels,
  type OverrideDraft,
} from '@/hooks/clinic/usePriceOverrides';
import { toast } from 'sonner';

export type InventoryCategory = 'Medication' | 'Disposable Item' | 'Vaccine' | 'Other';

const INVENTORY_CATEGORIES: InventoryCategory[] = [
  'Medication',
  'Disposable Item',
  'Vaccine',
  'Other',
];

export interface InventoryItemRow {
  id: string;
  name: string;
  cost_price: number;
  price_to_patient_max: number;
  standard_panel_price?: number | null;
  stock: number;
  status: string;
  category?: InventoryCategory | string | null;
  item_code?: string | null;
  is_otc?: boolean | null;
  brand?: string | null;
  uom?: string | null;
  default_indication?: string | null;
  default_dosage_qty?: string | null;
  default_dosage_unit?: string | null;
  default_frequency?: string | null;
  default_instruction?: string | null;
  default_duration?: string | null;
  default_duration_unit?: string | null;
  default_precaution?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemRow | null;
  /** Pre-selected category when adding from a category-specific tab. Ignored when editing. */
  defaultCategory?: InventoryCategory;
}

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const intField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid number' })
    .int('Must be a whole number')
    .nonnegative('Must be 0 or more'),
);

const optStr = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(''));

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost_price: moneyField,
  selling_price: moneyField,
  standard_panel_price: moneyField,
  current_stock: intField,
  status: z.enum(['active', 'inactive']),
  category: z.enum(['Medication', 'Disposable Item', 'Vaccine', 'Other']),
  item_code: optStr(100),
  brand: optStr(100),
  uom: optStr(50),
  is_otc: z.boolean().default(false),
  default_indication: optStr(500),
  default_dosage_qty: optStr(50),
  default_dosage_unit: optStr(50),
  default_frequency: optStr(50),
  default_instruction: optStr(100),
  default_duration: optStr(50),
  default_duration_unit: optStr(50),
  default_precaution: optStr(500),
});

type ItemFormData = z.infer<typeof itemSchema>;

const EMPTY_VALUES: ItemFormData = {
  name: '',
  cost_price: 0,
  selling_price: 0,
  standard_panel_price: 0,
  current_stock: 0,
  status: 'active',
  category: 'Medication',
  item_code: '',
  brand: '',
  uom: '',
  is_otc: false,
  default_indication: '',
  default_dosage_qty: '',
  default_dosage_unit: '',
  default_frequency: '',
  default_instruction: '',
  default_duration: '',
  default_duration_unit: '',
  default_precaution: '',
};

export function InventoryItemDialog({ open, onOpenChange, item, defaultCategory }: Props) {
  const addItem = useAddInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const reconcileOverrides = useReconcileOverrides();
  const { data: panels = [] } = useActivePanels();
  const { data: existingOverrides = [] } = usePriceOverridesForItem(item?.id);
  const isEdit = !!item;

  // Local state for the bespoke overrides editor
  const [overrides, setOverrides] = useState<OverrideDraft[]>([]);
  const [draftPanelId, setDraftPanelId] = useState<string>('');
  const [draftPrice, setDraftPrice] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: EMPTY_VALUES,
  });

  // Hydrate form when dialog opens / item changes
  useEffect(() => {
    if (!open) return;
    if (item) {
      const validCats: InventoryCategory[] = ['Medication', 'Disposable Item', 'Vaccine', 'Other'];
      const cat = (validCats as string[]).includes(item.category as string)
        ? (item.category as InventoryCategory)
        : 'Medication';
      reset({
        name: item.name,
        cost_price: Number(item.cost_price) || 0,
        selling_price: Number(item.price_to_patient_max) || 0,
        standard_panel_price: Number(item.standard_panel_price ?? 0) || 0,
        current_stock: Number(item.stock) || 0,
        status: (item.status as 'active' | 'inactive') ?? 'active',
        category: cat,
        item_code: item.item_code ?? '',
        brand: item.brand ?? '',
        uom: item.uom ?? '',
        is_otc: !!item.is_otc,
        default_indication: item.default_indication ?? '',
        default_dosage_qty: item.default_dosage_qty ?? '',
        default_dosage_unit: item.default_dosage_unit ?? '',
        default_frequency: item.default_frequency ?? '',
        default_instruction: item.default_instruction ?? '',
        default_duration: item.default_duration ?? '',
        default_duration_unit: item.default_duration_unit ?? '',
        default_precaution: item.default_precaution ?? '',
      });
    } else {
      reset({ ...EMPTY_VALUES, category: defaultCategory ?? 'Medication' });
      setOverrides([]);
    }
    setDraftPanelId('');
    setDraftPrice('');
  }, [open, item, reset, defaultCategory]);

  // Hydrate overrides whenever the existing list arrives for an edit
  useEffect(() => {
    if (!open || !item) return;
    setOverrides(
      existingOverrides.map((row) => ({
        panel_id: row.panel_id,
        override_price: Number(row.override_price) || 0,
      })),
    );
  }, [open, item, existingOverrides]);

  const submitting =
    addItem.isPending || updateItem.isPending || reconcileOverrides.isPending;
  const status = watch('status');
  const category = watch('category');

  const usedPanelIds = new Set(overrides.map((o) => o.panel_id));
  const availablePanels = panels.filter((p) => !usedPanelIds.has(p.id));

  const handleAddOverride = () => {
    if (!draftPanelId) {
      toast.error('Select a panel first');
      return;
    }
    const priceNum = Number(draftPrice);
    if (draftPrice === '' || Number.isNaN(priceNum) || priceNum < 0) {
      toast.error('Enter a valid override price');
      return;
    }
    if (usedPanelIds.has(draftPanelId)) {
      toast.error('This panel already has an override');
      return;
    }
    setOverrides((prev) => [
      ...prev,
      { panel_id: draftPanelId, override_price: priceNum },
    ]);
    setDraftPanelId('');
    setDraftPrice('');
  };

  const handleRemoveOverride = (panelId: string) => {
    setOverrides((prev) => prev.filter((o) => o.panel_id !== panelId));
  };

  const panelName = (id: string) =>
    panels.find((p) => p.id === id)?.name ?? 'Unknown panel';

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = {
        name: data.name,
        cost_price: data.cost_price,
        selling_price: data.selling_price,
        standard_panel_price: data.standard_panel_price,
        current_stock: data.current_stock,
        status: data.status,
        category: data.category,
        default_indication: data.default_indication?.trim() || null,
        default_dosage_qty: data.default_dosage_qty?.trim() || null,
        default_dosage_unit: data.default_dosage_unit?.trim() || null,
        default_frequency: data.default_frequency?.trim() || null,
        default_instruction: data.default_instruction?.trim() || null,
        default_duration: data.default_duration?.trim() || null,
        default_duration_unit: data.default_duration_unit?.trim() || null,
        default_precaution: data.default_precaution?.trim() || null,
      };

      // Step 1: persist the item itself
      let itemId: string;
      if (isEdit && item) {
        const res = await updateItem.mutateAsync({ id: item.id, ...payload });
        itemId = res.id;
        toast.success('Item updated');
      } else {
        const res = await addItem.mutateAsync(payload);
        itemId = res.id;
        toast.success('Item added');
      }

      // Step 2: reconcile bespoke panel overrides
      try {
        await reconcileOverrides.mutateAsync({
          target: { itemId },
          overrides,
        });
      } catch (overrideErr) {
        toast.error(
          overrideErr instanceof Error
            ? `Item saved, but overrides failed: ${overrideErr.message}`
            : 'Item saved, but overrides failed',
        );
        return; // keep dialog open so the user sees the issue
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>
            Configure inventory details, pricing tiers, and bespoke panel overrides.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {/* ─────────────── Section 1: Details ─────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  placeholder="e.g. Paracetamol 500mg"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-cost">Cost Price (RM)</Label>
                  <Input
                    id="item-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('cost_price')}
                  />
                  {errors.cost_price && (
                    <p className="text-sm text-destructive">
                      {errors.cost_price.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-stock">Current Stock</Label>
                  <Input
                    id="item-stock"
                    type="number"
                    step="1"
                    min="0"
                    {...register('current_stock')}
                  />
                  {errors.current_stock && (
                    <p className="text-sm text-destructive">
                      {errors.current_stock.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-category">Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) =>
                      setValue('category', v as InventoryCategory)
                    }
                  >
                    <SelectTrigger id="item-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setValue('status', v as 'active' | 'inactive')
                    }
                  >
                    <SelectTrigger id="item-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─────────────── Section 2: Pricing ─────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-selling">Self Pay (RM)</Label>
                  <Input
                    id="item-selling"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('selling_price')}
                  />
                  {errors.selling_price && (
                    <p className="text-sm text-destructive">
                      {errors.selling_price.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Price for walk-in / cash patients.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-panel-price">Standard Panel (RM)</Label>
                  <Input
                    id="item-panel-price"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('standard_panel_price')}
                  />
                  {errors.standard_panel_price && (
                    <p className="text-sm text-destructive">
                      {errors.standard_panel_price.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Default price for insurance panels.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Bespoke Panel Overrides */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">
                    Bespoke Panel Prices
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Set custom prices for specific panels that differ from the
                    standard panel rate.
                  </p>
                </div>

                {/* Inline add row */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={draftPanelId}
                    onValueChange={setDraftPanelId}
                    disabled={availablePanels.length === 0}
                  >
                    <SelectTrigger className="sm:flex-1">
                      <SelectValue
                        placeholder={
                          availablePanels.length === 0
                            ? 'All panels added'
                            : 'Select panel'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePanels.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Override price (RM)"
                    value={draftPrice}
                    onChange={(e) => setDraftPrice(e.target.value)}
                    className="sm:w-44"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddOverride}
                    disabled={!draftPanelId || draftPrice === ''}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>

                {/* List of current overrides */}
                {overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No bespoke overrides — all panels will use the Standard Panel
                    rate above.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {overrides.map((o) => (
                      <div
                        key={o.panel_id}
                        className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {panelName(o.panel_id)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            RM {Number(o.override_price).toFixed(2)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRemoveOverride(o.panel_id)}
                          aria-label={`Remove override for ${panelName(o.panel_id)}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ─────────────── Section 3: Default Dispensing Instructions ─────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Default Dispensing Instructions (Optional)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pre-fills the prescribing fields when this item is added to a
                consultation. Doctors can override per patient.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dosage qty + unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="def-dosage-qty">Dosage Qty</Label>
                  <Input
                    id="def-dosage-qty"
                    placeholder="e.g. 1"
                    {...register('default_dosage_qty')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="def-dosage-unit">Dosage Unit</Label>
                  <Select
                    value={watch('default_dosage_unit') ?? ''}
                    onValueChange={(v) => setValue('default_dosage_unit', v)}
                  >
                    <SelectTrigger id="def-dosage-unit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOSAGE_UNIT_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Frequency + duration + duration unit */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="def-frequency">Frequency</Label>
                  <Select
                    value={watch('default_frequency') ?? ''}
                    onValueChange={(v) => setValue('default_frequency', v)}
                  >
                    <SelectTrigger id="def-frequency">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="def-duration">Duration</Label>
                  <Input
                    id="def-duration"
                    placeholder="e.g. 5"
                    {...register('default_duration')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="def-duration-unit">Duration Unit</Label>
                  <Select
                    value={watch('default_duration_unit') ?? ''}
                    onValueChange={(v) => setValue('default_duration_unit', v)}
                  >
                    <SelectTrigger id="def-duration-unit">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_UNIT_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Instruction */}
              <div className="space-y-1.5">
                <Label>Instruction</Label>
                <ComboboxInput
                  value={watch('default_instruction') ?? ''}
                  onChange={(v) => setValue('default_instruction', v)}
                  options={INSTRUCTION_OPTIONS}
                  placeholder="Type or select"
                />
              </div>

              {/* Indication */}
              <div className="space-y-1.5">
                <Label>Indication</Label>
                <ComboboxInput
                  value={watch('default_indication') ?? ''}
                  onChange={(v) => setValue('default_indication', v)}
                  options={INDICATION_OPTIONS}
                  placeholder="Type or select"
                />
              </div>

              {/* Precaution */}
              <div className="space-y-1.5">
                <Label htmlFor="def-precaution">Precaution</Label>
                <Textarea
                  id="def-precaution"
                  rows={2}
                  placeholder={PRECAUTION_OPTIONS.join(', ')}
                  {...register('default_precaution')}
                />
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
