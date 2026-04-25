import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, Loader2, Plus, Trash2, X } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useAddPackage,
  useUpdatePackage,
  usePackageItems,
  useReconcilePackageItems,
  type PackageItemDraft,
} from '@/hooks/clinic/usePackages';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import { useServices } from '@/hooks/clinic/useServices';
import {
  usePriceOverridesForPackage,
  useReconcileOverrides,
  useActivePanels,
  type OverrideDraft,
} from '@/hooks/clinic/usePriceOverrides';
import { toast } from 'sonner';

export interface PackageRow {
  id: string;
  name: string;
  cost: number;
  price: number;
  standard_panel_price?: number | null;
  status?: 'active' | 'inactive' | string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: PackageRow | null;
}

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const qtyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter qty' })
    .positive('Must be > 0'),
);

const bundleRow = z.object({
  id: z.string().nullable(), // null = empty/unselected
  quantity: qtyField,
});

const packageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: moneyField, // → Base Package Price
  price: moneyField, // → Final Package Price
  standard_panel_price: moneyField,
  status: z.enum(['active', 'inactive']),
  services: z.array(bundleRow),
  medications: z.array(bundleRow),
});

type PackageFormData = z.infer<typeof packageSchema>;

const EMPTY: PackageFormData = {
  name: '',
  cost: 0,
  price: 0,
  standard_panel_price: 0,
  status: 'active',
  services: [],
  medications: [],
};

/* ------------------------------------------------------------------ */
/* Inline searchable picker (id-bound) for services / medications.    */
/* ------------------------------------------------------------------ */
interface PickerOption {
  id: string;
  name: string;
  unitPrice: number;
}

function ItemPicker({
  value,
  options,
  placeholder,
  onChange,
  disabledIds = [],
}: {
  value: string | null;
  options: PickerOption[];
  placeholder: string;
  onChange: (id: string | null) => void;
  disabledIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? null;
  const disabledSet = new Set(disabledIds.filter((id) => id !== value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isDisabled = disabledSet.has(opt.id);
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.name} ${opt.id}`}
                    disabled={isDisabled}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === opt.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{opt.name}</div>
                      <div className="text-xs text-muted-foreground">
                        RM {opt.unitPrice.toFixed(2)}
                        {isDisabled && ' • already added'}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Main dialog                                                         */
/* ------------------------------------------------------------------ */
export function PackageDialog({ open, onOpenChange, pkg }: Props) {
  const addPackage = useAddPackage();
  const updatePackage = useUpdatePackage();
  const reconcileOverrides = useReconcileOverrides();
  const reconcileItems = useReconcilePackageItems();
  const { data: panels = [] } = useActivePanels();
  const { data: existingOverrides = [] } = usePriceOverridesForPackage(pkg?.id);
  const { data: existingBundle = [] } = usePackageItems(pkg?.id);
  const { items: inventoryItems = [] } = useInventoryItems();
  const { services = [] } = useServices();
  const isEdit = !!pkg;

  const [overrides, setOverrides] = useState<OverrideDraft[]>([]);
  const [draftPanelId, setDraftPanelId] = useState<string>('');
  const [draftPrice, setDraftPrice] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: EMPTY,
  });

  const servicesArr = useFieldArray({ control, name: 'services' });
  const medicationsArr = useFieldArray({ control, name: 'medications' });

  /* ---------------- Active option lists ---------------- */
  const serviceOptions: PickerOption[] = useMemo(
    () =>
      services
        .filter((s) => (s.status ?? 'active') === 'active')
        .map((s) => ({
          id: s.id,
          name: s.name,
          unitPrice: Number(s.price_to_patient) || 0,
        })),
    [services],
  );

  const medicationOptions: PickerOption[] = useMemo(
    () =>
      inventoryItems
        .filter((i) => (i.status ?? 'active') === 'active')
        .map((i) => ({
          id: i.id,
          name: i.name,
          unitPrice: Number(i.price_to_patient_max) || 0,
        })),
    [inventoryItems],
  );

  /* ---------------- Hydration ---------------- */
  useEffect(() => {
    if (!open) return;
    if (pkg) {
      reset({
        name: pkg.name,
        cost: Number(pkg.cost) || 0,
        price: Number(pkg.price) || 0,
        standard_panel_price: Number(pkg.standard_panel_price ?? 0) || 0,
        status: pkg.status === 'inactive' ? 'inactive' : 'active',
        services: [],
        medications: [],
      });
    } else {
      reset(EMPTY);
      setOverrides([]);
    }
    setDraftPanelId('');
    setDraftPrice('');
  }, [open, pkg, reset]);

  // Hydrate bundle contents on edit when query resolves
  useEffect(() => {
    if (!open || !pkg) return;
    setValue(
      'services',
      existingBundle
        .filter((b) => b.item_type === 'service')
        .map((b) => ({ id: b.service_id, quantity: Number(b.quantity) || 1 })),
    );
    setValue(
      'medications',
      existingBundle
        .filter((b) => b.item_type === 'medication')
        .map((b) => ({
          id: b.inventory_item_id,
          quantity: Number(b.quantity) || 1,
        })),
    );
  }, [open, pkg, existingBundle, setValue]);

  // Hydrate overrides
  useEffect(() => {
    if (!open || !pkg) return;
    setOverrides(
      existingOverrides.map((row) => ({
        panel_id: row.panel_id,
        override_price: Number(row.override_price) || 0,
      })),
    );
  }, [open, pkg, existingOverrides]);

  const submitting =
    addPackage.isPending ||
    updatePackage.isPending ||
    reconcileItems.isPending ||
    reconcileOverrides.isPending;
  const status = watch('status');

  /* ---------------- Live totals ---------------- */
  const watchedServices = watch('services');
  const watchedMedications = watch('medications');

  const totalAddOns = useMemo(() => {
    let sum = 0;
    for (const row of watchedServices ?? []) {
      const opt = serviceOptions.find((o) => o.id === row.id);
      if (opt) sum += opt.unitPrice * (Number(row.quantity) || 0);
    }
    for (const row of watchedMedications ?? []) {
      const opt = medicationOptions.find((o) => o.id === row.id);
      if (opt) sum += opt.unitPrice * (Number(row.quantity) || 0);
    }
    return sum;
  }, [watchedServices, watchedMedications, serviceOptions, medicationOptions]);

  /* ---------------- Overrides handlers ---------------- */
  const usedPanelIds = new Set(overrides.map((o) => o.panel_id));
  const availablePanels = panels.filter((p) => !usedPanelIds.has(p.id));

  const handleAddOverride = () => {
    if (!draftPanelId) return toast.error('Select a panel first');
    const priceNum = Number(draftPrice);
    if (draftPrice === '' || Number.isNaN(priceNum) || priceNum < 0) {
      return toast.error('Enter a valid override price');
    }
    if (usedPanelIds.has(draftPanelId)) {
      return toast.error('This panel already has an override');
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

  /* ---------------- Submit ---------------- */
  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = {
        name: data.name,
        cost: data.cost,
        price: data.price,
        standard_panel_price: data.standard_panel_price,
        status: data.status,
      };

      let packageId: string;
      if (isEdit && pkg) {
        const res = await updatePackage.mutateAsync({ id: pkg.id, ...payload });
        packageId = res.id;
        toast.success('Package updated');
      } else {
        const res = await addPackage.mutateAsync(payload);
        packageId = res.id;
        toast.success('Package added');
      }

      // Bundle reconciliation
      const bundle: PackageItemDraft[] = [
        ...data.services
          .filter((r) => !!r.id)
          .map((r) => ({
            item_type: 'service' as const,
            service_id: r.id!,
            quantity: r.quantity,
          })),
        ...data.medications
          .filter((r) => !!r.id)
          .map((r) => ({
            item_type: 'medication' as const,
            inventory_item_id: r.id!,
            quantity: r.quantity,
          })),
      ];

      try {
        await reconcileItems.mutateAsync({ packageId, items: bundle });
      } catch (bundleErr) {
        toast.error(
          bundleErr instanceof Error
            ? `Package saved, but bundle failed: ${bundleErr.message}`
            : 'Package saved, but bundle failed',
        );
        return;
      }

      try {
        await reconcileOverrides.mutateAsync({
          target: { packageId },
          overrides,
        });
      } catch (overrideErr) {
        toast.error(
          overrideErr instanceof Error
            ? `Package saved, but overrides failed: ${overrideErr.message}`
            : 'Package saved, but overrides failed',
        );
        return;
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save package');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            Bundle services and medications into a single billable package.
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
                <Label htmlFor="pkg-name">Package Name</Label>
                <Input
                  id="pkg-name"
                  placeholder="e.g. Annual Wellness Package"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pkg-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) =>
                    setValue('status', v as 'active' | 'inactive')
                  }
                >
                  <SelectTrigger id="pkg-status" className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* ─────────────── Section 2: Bundle Contents ─────────────── */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Bundle Contents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Services list */}
              <BundleList
                title="Services"
                rows={servicesArr.fields}
                control={control}
                register={register}
                onAppend={() => servicesArr.append({ id: null, quantity: 1 })}
                onRemove={(i) => servicesArr.remove(i)}
                fieldName="services"
                options={serviceOptions}
                watchedRows={watchedServices ?? []}
                emptyHint="No services in this bundle yet."
                addLabel="Add Service"
                placeholder="Select a service…"
              />

              <Separator />

              {/* Medications list */}
              <BundleList
                title="Medications"
                rows={medicationsArr.fields}
                control={control}
                register={register}
                onAppend={() =>
                  medicationsArr.append({ id: null, quantity: 1 })
                }
                onRemove={(i) => medicationsArr.remove(i)}
                fieldName="medications"
                options={medicationOptions}
                watchedRows={watchedMedications ?? []}
                emptyHint="No medications in this bundle yet."
                addLabel="Add Item"
                placeholder="Select a medication…"
              />
            </CardContent>
          </Card>

          {/* ─────────────── Section 3: Pricing ─────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Total Add-ons (read-only) */}
              <div className="rounded-md border bg-muted/40 px-3 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Total Add-ons Price</div>
                  <div className="text-xs text-muted-foreground">
                    Sum of selected items × quantity (reference only).
                  </div>
                </div>
                <div className="text-base font-semibold tabular-nums">
                  RM {totalAddOns.toFixed(2)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-cost">Base Package Price (RM)</Label>
                  <Input
                    id="pkg-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('cost')}
                  />
                  {errors.cost && (
                    <p className="text-sm text-destructive">{errors.cost.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Bundle-level cost basis for margin reporting.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-price">Final Package Price (RM)</Label>
                  <Input
                    id="pkg-price"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('price')}
                  />
                  {errors.price && (
                    <p className="text-sm text-destructive">{errors.price.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Amount billed to walk-in / cash patients.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pkg-panel-price">Standard Panel (RM)</Label>
                <Input
                  id="pkg-panel-price"
                  type="number"
                  step="0.01"
                  min="0"
                  className="sm:max-w-xs"
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

              <Separator />

              {/* Bespoke panel overrides */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Bespoke Panel Prices</Label>
                  <p className="text-xs text-muted-foreground">
                    Set custom prices for specific panels that differ from the
                    standard panel rate.
                  </p>
                </div>

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
              {isEdit ? 'Save Changes' : 'Add Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Bundle list sub-component                                           */
/* ------------------------------------------------------------------ */
interface BundleListProps {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  fieldName: 'services' | 'medications';
  options: PickerOption[];
  watchedRows: Array<{ id?: string | null; quantity?: number }>;
  onAppend: () => void;
  onRemove: (index: number) => void;
  emptyHint: string;
  addLabel: string;
  placeholder: string;
}

function BundleList({
  title,
  rows,
  control,
  register,
  fieldName,
  options,
  watchedRows,
  onAppend,
  onRemove,
  emptyHint,
  addLabel,
  placeholder,
}: BundleListProps) {
  const usedIds = watchedRows.map((r) => r.id).filter((x): x is string => !!x);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAppend}>
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const currentId = watchedRows[idx]?.id ?? null;
            const qty = Number(watchedRows[idx]?.quantity) || 0;
            const opt = options.find((o) => o.id === currentId);
            const lineTotal = opt ? opt.unitPrice * qty : 0;
            return (
              <div
                key={row.id}
                className="grid grid-cols-12 gap-2 items-start rounded-md border p-2"
              >
                <div className="col-span-7">
                  <Controller
                    control={control}
                    name={`${fieldName}.${idx}.id` as const}
                    render={({ field }) => (
                      <ItemPicker
                        value={field.value}
                        options={options}
                        placeholder={placeholder}
                        onChange={field.onChange}
                        disabledIds={usedIds}
                      />
                    )}
                  />
                  {opt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Unit: RM {opt.unitPrice.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Qty"
                    {...register(`${fieldName}.${idx}.quantity` as const)}
                  />
                  {opt && (
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                      = RM {lineTotal.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(idx)}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
