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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAddService, useUpdateService } from '@/hooks/clinic/useServices';
import {
  usePriceOverridesForService,
  useReconcileOverrides,
  useActivePanels,
  type OverrideDraft,
} from '@/hooks/clinic/usePriceOverrides';
import { toast } from 'sonner';

export type ServiceCategory =
  | 'General Service'
  | 'Procedure'
  | 'Laboratory Investigation'
  | 'Other';

const SERVICE_CATEGORIES: ServiceCategory[] = [
  'General Service',
  'Procedure',
  'Laboratory Investigation',
  'Other',
];

export interface ServiceRow {
  id: string;
  name: string;
  cost: number;
  price_to_patient: number;
  standard_panel_price?: number | null;
  status?: 'active' | 'inactive' | string;
  category?: ServiceCategory | string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceRow | null;
  /** Pre-selected category when adding from a category-specific tab. Ignored when editing. */
  defaultCategory?: ServiceCategory;
}

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: moneyField,
  price: moneyField,
  standard_panel_price: moneyField,
  status: z.enum(['active', 'inactive']),
  category: z.enum(['General Service', 'Procedure', 'Laboratory Investigation', 'Other']),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const EMPTY: ServiceFormData = {
  name: '',
  cost: 0,
  price: 0,
  standard_panel_price: 0,
  status: 'active',
  category: 'General Service',
};

export function ServiceDialog({ open, onOpenChange, service, defaultCategory }: Props) {
  const addService = useAddService();
  const updateService = useUpdateService();
  const reconcileOverrides = useReconcileOverrides();
  const { data: panels = [] } = useActivePanels();
  const { data: existingOverrides = [] } = usePriceOverridesForService(service?.id);
  const isEdit = !!service;

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
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (service) {
      const validCats: ServiceCategory[] = ['General Service', 'Procedure', 'Laboratory Investigation', 'Other'];
      const cat = (validCats as string[]).includes(service.category as string)
        ? (service.category as ServiceCategory)
        : 'General Service';
      reset({
        name: service.name,
        cost: Number(service.cost) || 0,
        price: Number(service.price_to_patient) || 0,
        standard_panel_price: Number(service.standard_panel_price ?? 0) || 0,
        status: service.status === 'inactive' ? 'inactive' : 'active',
        category: cat,
      });
    } else {
      reset({ ...EMPTY, category: defaultCategory ?? 'General Service' });
      setOverrides([]);
    }
    setDraftPanelId('');
    setDraftPrice('');
  }, [open, service, reset, defaultCategory]);

  useEffect(() => {
    if (!open || !service) return;
    setOverrides(
      existingOverrides.map((row) => ({
        panel_id: row.panel_id,
        override_price: Number(row.override_price) || 0,
      })),
    );
  }, [open, service, existingOverrides]);

  const submitting =
    addService.isPending || updateService.isPending || reconcileOverrides.isPending;
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
        cost: data.cost,
        price: data.price,
        standard_panel_price: data.standard_panel_price,
        status: data.status,
        category: data.category,
      };

      let serviceId: string;
      if (isEdit && service) {
        const res = await updateService.mutateAsync({ id: service.id, ...payload });
        serviceId = res.id;
        toast.success('Service updated');
      } else {
        const res = await addService.mutateAsync(payload);
        serviceId = res.id;
        toast.success('Service added');
      }

      try {
        await reconcileOverrides.mutateAsync({
          target: { serviceId },
          overrides,
        });
      } catch (overrideErr) {
        toast.error(
          overrideErr instanceof Error
            ? `Service saved, but overrides failed: ${overrideErr.message}`
            : 'Service saved, but overrides failed',
        );
        return;
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save service');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            Configure service details, pricing tiers, and bespoke panel overrides.
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
                <Label htmlFor="svc-name">Name</Label>
                <Input
                  id="svc-name"
                  placeholder="e.g. Wound Dressing"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="svc-cost">Cost (RM)</Label>
                  <Input
                    id="svc-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('cost')}
                  />
                  {errors.cost && (
                    <p className="text-sm text-destructive">{errors.cost.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setValue('status', v as 'active' | 'inactive')
                    }
                  >
                    <SelectTrigger id="svc-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setValue('category', v as ServiceCategory)
                  }
                >
                  <SelectTrigger id="svc-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Label htmlFor="svc-price">Self Pay (RM)</Label>
                  <Input
                    id="svc-price"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('price')}
                  />
                  {errors.price && (
                    <p className="text-sm text-destructive">{errors.price.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Price for walk-in / cash patients.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-panel-price">Standard Panel (RM)</Label>
                  <Input
                    id="svc-panel-price"
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
              {isEdit ? 'Save Changes' : 'Add Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
