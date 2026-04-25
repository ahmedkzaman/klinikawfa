import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  type InsuranceProviderRow,
  useAddInsuranceProvider,
  useUpdateInsuranceProvider,
} from '@/hooks/clinic/useInsuranceProviders';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: InsuranceProviderRow | null;
}

const optionalString = z
  .string()
  .trim()
  .max(255)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  panel_type: z.enum(['tpa', 'corporate', 'insurance', 'government', 'other']),
  panel_code: optionalString,
  status: z.enum(['active', 'inactive']),
  price_tier: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  submission_preference: z.enum(['bulk_claim', 'per_visit']),
  verification_type: z.enum(['url', 'phone', 'email', 'manual']),
  verification_link: optionalString,
  claim_due_date_type: optionalString,
  tin_number: optionalString,
  company_name: optionalString,
  company_reg_number: optionalString,
  person_in_charge: optionalString,
  phone: optionalString,
  email: optionalString,
  address_line_1: optionalString,
  address_line_2: optionalString,
  postcode: optionalString,
  city: optionalString,
  state: optionalString,
  country: optionalString,
});

type FormValues = z.input<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  panel_type: 'tpa',
  panel_code: '',
  status: 'active',
  price_tier: '',
  submission_preference: 'bulk_claim',
  verification_type: 'url',
  verification_link: '',
  claim_due_date_type: '',
  tin_number: '',
  company_name: '',
  company_reg_number: '',
  person_in_charge: '',
  phone: '',
  email: '',
  address_line_1: '',
  address_line_2: '',
  postcode: '',
  city: '',
  state: '',
  country: '',
};

export function PanelDialog({ open, onOpenChange, panel }: Props) {
  const isEdit = !!panel;
  const addMut = useAddInsuranceProvider();
  const updateMut = useUpdateInsuranceProvider();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (panel) {
      form.reset({
        name: panel.name ?? '',
        panel_type: (panel.panel_type as FormValues['panel_type']) ?? 'tpa',
        panel_code: panel.panel_code ?? '',
        status: (panel.status as FormValues['status']) ?? 'active',
        price_tier: panel.price_tier ?? '',
        submission_preference:
          (panel.submission_preference as FormValues['submission_preference']) ??
          'bulk_claim',
        verification_type:
          (panel.verification_type as FormValues['verification_type']) ?? 'url',
        verification_link: panel.verification_link ?? '',
        claim_due_date_type: panel.claim_due_date_type ?? '',
        tin_number: panel.tin_number ?? '',
        company_name: panel.company_name ?? '',
        company_reg_number: panel.company_reg_number ?? '',
        person_in_charge: panel.person_in_charge ?? '',
        phone: panel.phone ?? '',
        email: panel.email ?? '',
        address_line_1: panel.address_line_1 ?? '',
        address_line_2: panel.address_line_2 ?? '',
        postcode: panel.postcode ?? '',
        city: panel.city ?? '',
        state: panel.state ?? '',
        country: panel.country ?? '',
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, panel, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed = schema.parse(values);
    try {
      if (isEdit && panel) {
        await updateMut.mutateAsync({ id: panel.id, patch: parsed });
        toast.success('Panel updated');
      } else {
        await addMut.mutateAsync(parsed);
        toast.success('Panel created');
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast.error(message);
    }
  });

  const submitting = addMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Panel' : 'Add Panel'}</DialogTitle>
          <DialogDescription>
            Manage corporate panels, TPAs, and insurance provider profiles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Identity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Panel Name *" error={form.formState.errors.name?.message}>
                <Input {...form.register('name')} placeholder="e.g. Allianz" />
              </Field>
              <Field label="Panel Code">
                <Input {...form.register('panel_code')} placeholder="e.g. ALZ-001" />
              </Field>
              <Field label="Panel Type">
                <SelectField
                  value={form.watch('panel_type')}
                  onChange={(v) =>
                    form.setValue('panel_type', v as FormValues['panel_type'])
                  }
                  options={[
                    { value: 'tpa', label: 'TPA' },
                    { value: 'insurance', label: 'Insurance' },
                    { value: 'corporate', label: 'Corporate' },
                    { value: 'government', label: 'Government' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </Field>
              <Field label="Status">
                <SelectField
                  value={form.watch('status')}
                  onChange={(v) =>
                    form.setValue('status', v as FormValues['status'])
                  }
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </Field>
              <Field label="Price Tier (key)">
                <Input
                  {...form.register('price_tier')}
                  placeholder="e.g. tier_a"
                />
              </Field>
              <Field label="TIN Number">
                <Input {...form.register('tin_number')} placeholder="LHDN TIN" />
              </Field>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Billing & Verification</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Submission Preference">
                <SelectField
                  value={form.watch('submission_preference')}
                  onChange={(v) =>
                    form.setValue(
                      'submission_preference',
                      v as FormValues['submission_preference'],
                    )
                  }
                  options={[
                    { value: 'bulk_claim', label: 'Bulk Claim' },
                    { value: 'per_visit', label: 'Per Visit' },
                  ]}
                />
              </Field>
              <Field label="Claim Due (e.g. net 30)">
                <Input
                  {...form.register('claim_due_date_type')}
                  placeholder="net_30"
                />
              </Field>
              <Field label="Verification Type">
                <SelectField
                  value={form.watch('verification_type')}
                  onChange={(v) =>
                    form.setValue(
                      'verification_type',
                      v as FormValues['verification_type'],
                    )
                  }
                  options={[
                    { value: 'url', label: 'URL' },
                    { value: 'phone', label: 'Phone' },
                    { value: 'email', label: 'Email' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                />
              </Field>
              <Field label="Verification Link / Contact">
                <Input
                  {...form.register('verification_link')}
                  placeholder="https://..."
                />
              </Field>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Company & Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company Name">
                <Input {...form.register('company_name')} />
              </Field>
              <Field label="Company Reg. No">
                <Input {...form.register('company_reg_number')} />
              </Field>
              <Field label="Person in Charge">
                <Input {...form.register('person_in_charge')} />
              </Field>
              <Field label="Phone">
                <Input {...form.register('phone')} placeholder="+60..." />
              </Field>
              <Field label="Email">
                <Input
                  {...form.register('email')}
                  type="email"
                  placeholder="claims@..."
                />
              </Field>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Address Line 1">
                <Input {...form.register('address_line_1')} />
              </Field>
              <Field label="Address Line 2">
                <Input {...form.register('address_line_2')} />
              </Field>
              <Field label="Postcode">
                <Input {...form.register('postcode')} />
              </Field>
              <Field label="City">
                <Input {...form.register('city')} />
              </Field>
              <Field label="State">
                <Input {...form.register('state')} />
              </Field>
              <Field label="Country">
                <Input {...form.register('country')} placeholder="Malaysia" />
              </Field>
            </div>
          </section>

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
              {isEdit ? 'Save changes' : 'Create panel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
