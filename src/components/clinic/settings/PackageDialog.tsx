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
import { useAddPackage, useUpdatePackage } from '@/hooks/clinic/usePackages';
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

const packageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: moneyField,
  price: moneyField,
  standard_panel_price: moneyField,
  status: z.enum(['active', 'inactive']),
});

type PackageFormData = z.infer<typeof packageSchema>;

const EMPTY: PackageFormData = {
  name: '',
  cost: 0,
  price: 0,
  standard_panel_price: 0,
  status: 'active',
};

export function PackageDialog({ open, onOpenChange, pkg }: Props) {
  const addPackage = useAddPackage();
  const updatePackage = useUpdatePackage();
  const reconcileOverrides = useReconcileOverrides();
  const { data: panels = [] } = useActivePanels();
  const { data: existingOverrides = [] } = usePriceOverridesForPackage(pkg?.id);
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
    formState: { errors },
  } = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (pkg) {
      reset({
        name: pkg.name,
        cost: Number(pkg.cost) || 0,
        price: Number(pkg.price) || 0,
        standard_panel_price: Number(pkg.standard_panel_price ?? 0) || 0,
        status: pkg.status === 'inactive' ? 'inactive' : 'active',
      });
    } else {
      reset(EMPTY);
      setOverrides([]);
    }
    setDraftPanelId('');
    setDraftPrice('');
  }, [open, pkg, reset]);

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
    addPackage.isPending || updatePackage.isPending || reconcileOverrides.isPending;
  const status = watch('status');

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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            Configure package details, pricing tiers, and bespoke panel overrides.
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
                <Label htmlFor="pkg-name">Name</Label>
                <Input
                  id="pkg-name"
                  placeholder="e.g. Annual Wellness Package"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-cost">Cost (RM)</Label>
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
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setValue('status', v as 'active' | 'inactive')
                    }
                  >
                    <SelectTrigger id="pkg-status">
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
                  <Label htmlFor="pkg-price">Self Pay (RM)</Label>
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
                    Price for walk-in / cash patients.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-panel-price">Standard Panel (RM)</Label>
                  <Input
                    id="pkg-panel-price"
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
              {isEdit ? 'Save Changes' : 'Add Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
