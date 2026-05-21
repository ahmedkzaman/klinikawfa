import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreatePatient } from '@/hooks/clinic/usePatients';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import {
  patientSchema,
  RELIGIONS,
  ID_TYPE_OPTIONS,
  ID_TYPE_FIELD_LABEL,
  ID_TYPE_PLACEHOLDER,
  type PatientFormData,
  type IdType,
} from '@/components/clinic/patientFormSchema';
import {
  ReadMyKadButton,
  cleanIC,
  mapGender,
  mapDOB,
} from '@/components/clinic/ReadMyKadButton';
import { toMalayTitleCase, toUpperSafe } from '@/lib/textCase';
import type { PatientRow } from '@/types/clinic';

type FormData = PatientFormData;

interface RegisterPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (patient: PatientRow) => void;
}

export function RegisterPatientDialog({
  open,
  onOpenChange,
  onCreated,
}: RegisterPatientDialogProps) {
  const create = useCreatePatient();
  const { data: panels = [] } = useInsuranceProviders({ activeOnly: true });
  const [submitting, setSubmitting] = useState(false);
  const [mykadConsent, setMykadConsent] = useState(false);
  const [justRead, setJustRead] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: '',
      phone: '',
      religion: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      default_panel_id: null,
      address: '',
      panel_remarks: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const created = await create.mutateAsync({
        name: toUpperSafe(data.name),
        phone: data.phone || null,
        national_id: data.national_id?.trim() || null,
        passport_no: data.passport_no?.trim() || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        email: data.email || null,
        religion: data.religion,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        default_panel_id: data.default_panel_id || null,
        allergies: data.allergies || null,
        underlying_conditions: data.underlying_conditions || null,
        address: data.address ? toUpperSafe(data.address) : null,
        panel_remarks: (data.panel_remarks ?? '').trim() || null,
      } as never);
      toast.success(`Patient registered: ${created.name}`);
      reset();
      setMykadConsent(false);
      setJustRead(false);
      onOpenChange(false);
      onCreated?.(created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register patient';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register Patient</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 flex items-start gap-2">
            <Checkbox
              id="mykad_consent"
              checked={mykadConsent}
              onCheckedChange={(v) => setMykadConsent(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="mykad_consent" className="text-sm font-normal leading-snug cursor-pointer">
              Patient consents to MyKad being read for clinic registration purpose.
            </Label>
          </div>

          {justRead && (
            <Alert>
              <AlertDescription>
                Please confirm patient details before saving.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="name">Full name *</Label>
            <Input
              id="name"
              {...register('name', {
                onBlur: (e) => {
                  const formatted = toMalayTitleCase(e.target.value);
                  if (formatted !== e.target.value) {
                    setValue('name', formatted, { shouldValidate: true, shouldDirty: true });
                  }
                },
              })}
            />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="national_id">MyKad / IC *</Label>
                <ReadMyKadButton
                  disabled={!mykadConsent}
                  onRead={(data) => {
                    if (data.name) setValue('name', toMalayTitleCase(data.name), { shouldValidate: true, shouldDirty: true });
                    const ic = cleanIC(data.ic_no);
                    if (ic) setValue('national_id', ic, { shouldValidate: true, shouldDirty: true });
                    const dob = mapDOB(data.dob);
                    if (dob) setValue('date_of_birth', dob, { shouldValidate: true, shouldDirty: true });
                    const g = mapGender(data.gender);
                    if (g) setValue('gender', g, { shouldValidate: true, shouldDirty: true });
                    if (data.address) setValue('address', toUpperSafe(data.address), { shouldValidate: true, shouldDirty: true });
                    setJustRead(true);
                    toast.success('MyKad read successfully');
                  }}
                />
              </div>
              <Input id="national_id" placeholder="12 digits" {...register('national_id')} />
              {errors.national_id && (
                <p className="text-sm text-destructive mt-1">{errors.national_id.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="passport_no">Passport No. *</Label>
              <Input id="passport_no" placeholder="For foreign patients" {...register('passport_no')} />
              {errors.passport_no && (
                <p className="text-sm text-destructive mt-1">{errors.passport_no.message}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2 -mt-2">
              Provide MyKad for Malaysians or Passport No. for foreigners (one is required).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" placeholder="+60 12 345 6789" {...register('phone')} />
              {errors.phone && (
                <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
            </div>
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={watch('gender') ?? ''}
                onValueChange={(v) => setValue('gender', v as FormData['gender'])}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="religion">Religion *</Label>
              <Select
                value={watch('religion') ?? ''}
                onValueChange={(v) => setValue('religion', v, { shouldValidate: true })}
              >
                <SelectTrigger id="religion">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {RELIGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.religion && (
                <p className="text-sm text-destructive mt-1">{errors.religion.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <p className="text-sm font-medium">Emergency Contact</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ec_name">Contact name *</Label>
                <Input id="ec_name" {...register('emergency_contact_name')} />
                {errors.emergency_contact_name && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.emergency_contact_name.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="ec_phone">Contact phone *</Label>
                <Input id="ec_phone" placeholder="+60 12 345 6789" {...register('emergency_contact_phone')} />
                {errors.emergency_contact_phone && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.emergency_contact_phone.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="default_panel">Default Panel (optional)</Label>
            <Select
              value={watch('default_panel_id') ?? '__none__'}
              onValueChange={(v) =>
                setValue('default_panel_id', v === '__none__' ? null : v, { shouldValidate: true })
              }
            >
              <SelectTrigger id="default_panel">
                <SelectValue placeholder="Self-Pay (no panel)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Self-Pay (no panel)</SelectItem>
                {panels.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-prefills the payer at every check-in (still editable per visit).
            </p>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} placeholder="Auto-filled from MyKad" {...register('address')} />
          </div>
          <div>
            <Label htmlFor="panel_remarks">Patient's Panel Balance / Remarks</Label>
            <Textarea
              id="panel_remarks"
              rows={2}
              placeholder="e.g. Balance RM 21 as of 2/2/26"
              {...register('panel_remarks')}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Record remaining balance or limits. Shown to doctors and dispensary on
              every visit, even when paying cash.
            </p>
          </div>
          <div>
            <Label htmlFor="allergies">Allergies</Label>
            <Textarea id="allergies" rows={2} {...register('allergies')} />
          </div>
          <div>
            <Label htmlFor="underlying_conditions">Underlying conditions</Label>
            <Textarea id="underlying_conditions" rows={2} {...register('underlying_conditions')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
