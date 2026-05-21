import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Search, UserCheck, X } from 'lucide-react';
import { toMalayTitleCase } from '@/lib/textCase';
import {
  ReadMyKadButton,
  cleanIC,
  mapGender,
  mapDOB,
} from '@/components/clinic/ReadMyKadButton';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import {
  useCreatePatient,
  useDebouncedValue,
  usePatientByIc,
  useSearchPatients,
  useUpdatePatient,
} from '@/hooks/clinic/usePatients';
import { usePatientOutstanding, formatRm } from '@/hooks/clinic/usePatientFinancials';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import { useDoctors } from '@/hooks/clinic/useDoctors';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { PatientRow } from '@/types/clinic';

const VISIT_PURPOSES = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'medical_check', label: 'Medical check-up' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'other', label: 'Other' },
] as const;

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'] as const;

const ID_TYPES = ['mykad', 'passport', 'police', 'army'] as const;
type LocalIdType = (typeof ID_TYPES)[number];

const ID_TYPE_OPTIONS_LOCAL: Array<{ value: LocalIdType; label: string }> = [
  { value: 'mykad', label: 'MyKad / MyKid' },
  { value: 'police', label: 'Police ID' },
  { value: 'army', label: 'Army ID (Tentera)' },
  { value: 'passport', label: 'Passport' },
];

const ID_LABELS: Record<LocalIdType, string> = {
  mykad: 'MyKad / IC',
  police: 'Police ID Number',
  army: 'Army ID (Tentera)',
  passport: 'Passport No.',
};

const ID_PLACEHOLDERS: Record<LocalIdType, string> = {
  mykad: '12 digits — auto-fills DOB & gender',
  police: 'e.g. RF123456',
  army: 'e.g. T1234567',
  passport: 'e.g. A12345678',
};

const schema = z
  .object({
    // Demographics
    id_type: z.enum(ID_TYPES).default('mykad'),
    national_id: z.string().trim().max(30).optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone is required')
      .max(20)
      .regex(/^[+]?[0-9\s-]+$/, 'Invalid phone number'),
    gender: z.enum(['male', 'female', 'other', '']).optional(),
    date_of_birth: z.string().optional(),
    email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),

    // Dependant linkage
    is_dependent: z.boolean(),
    principal_id: z.string().nullable(),
    relationship: z.string().optional(),

    // Today's visit
    visit_type: z.enum(['consultation', 'direct_sale']),
    visit_purpose: z.enum([
      'consultation',
      'follow_up',
      'vaccination',
      'medical_check',
      'procedure',
      'other',
    ]),
    visit_notes: z.string().max(1000).optional(),
    payment_method: z.enum(['cash', 'panel']),
    panel_id: z.string().nullable(),
    panel_remarks: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const idType = data.id_type ?? 'mykad';
    const idVal = (data.national_id ?? '').trim();
    if (idType === 'mykad') {
      if (idVal && !/^\d{12}$/.test(idVal.replace(/[-\s]/g, ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'MyKad must be 12 digits',
        });
      }
    } else if (idType === 'passport') {
      if (idVal.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'Passport number is required (min 5 chars)',
        });
      }
    } else {
      if (idVal.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: `${ID_LABELS[idType]} is required (min 5 chars)`,
        });
      } else if (!/^[A-Za-z0-9-]+$/.test(idVal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'Only letters, numbers and dashes allowed',
        });
      }
    }

    if (data.is_dependent && !data.principal_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['principal_id'],
        message: 'Select the principal patient',
      });
    }
    if (data.is_dependent && !data.relationship) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relationship'],
        message: 'Select the relationship',
      });
    }
    if (data.payment_method === 'panel' && !data.panel_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['panel_id'],
        message: 'Select the panel company',
      });
    }
  });

type FormData = z.infer<typeof schema>;

const EMPTY: FormData = {
  id_type: 'mykad',
  national_id: '',
  name: '',
  phone: '',
  gender: '',
  date_of_birth: '',
  email: '',
  is_dependent: false,
  principal_id: null,
  relationship: '',
  visit_type: 'consultation',
  visit_purpose: 'consultation',
  visit_notes: '',
  payment_method: 'cash',
  panel_id: null,
  panel_remarks: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Parse a 12-digit Malaysian MyKad (NRIC) to derive DOB and gender.
 * Format: YYMMDD-PB-###G  (G odd = male, even = female)
 * Century rule: YY <= current 2-digit year → 20YY; otherwise 19YY.
 */
function parseMyKad(ic: string): { dob: string | null; gender: 'male' | 'female' | null } {
  const clean = ic.replace(/[-\s]/g, '');
  if (!/^\d{12}$/.test(clean)) return { dob: null, gender: null };

  const yy = parseInt(clean.slice(0, 2), 10);
  const mm = parseInt(clean.slice(2, 4), 10);
  const dd = parseInt(clean.slice(4, 6), 10);
  const lastDigit = parseInt(clean.slice(11, 12), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { dob: null, gender: null };

  const currentYY = new Date().getFullYear() % 100;
  const century = yy <= currentYY ? 2000 : 1900;
  const year = century + yy;

  const dob = `${year.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd
    .toString()
    .padStart(2, '0')}`;
  const gender: 'male' | 'female' = lastDigit % 2 === 1 ? 'male' : 'female';

  return { dob, gender };
}

export function RegisterAndCheckInDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const { data: panels = [] } = useInsuranceProviders({ activeOnly: true });

  const [submitting, setSubmitting] = useState(false);
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
  const [loadedIc, setLoadedIc] = useState<string | null>(null);
  const [principalQuery, setPrincipalQuery] = useState('');
  const [principalPickerOpen, setPrincipalPickerOpen] = useState(false);
  const [selectedPrincipal, setSelectedPrincipal] = useState<PatientRow | null>(null);
  const debouncedPrincipalQuery = useDebouncedValue(principalQuery, 250);
  const { data: principalResults = [], isFetching: searchingPrincipals } =
    useSearchPatients(debouncedPrincipalQuery);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const isDependent = watch('is_dependent');
  const paymentMethod = watch('payment_method');
  const visitType = watch('visit_type');
  const isDirectSale = visitType === 'direct_sale';
  const nationalId = watch('national_id');
  const dobValue = watch('date_of_birth');
  const genderValue = watch('gender');
  const idType = (watch('id_type') ?? 'mykad') as LocalIdType;
  const isMykadType = idType === 'mykad';

  // Optional doctor assignment at check-in
  const [assignedDoctorId, setAssignedDoctorId] = useState<string | null>(null);
  const [visitRemarks, setVisitRemarks] = useState('');
  const { data: allDoctors } = useDoctors();
  const activeDoctors = useMemo(
    () => (allDoctors ?? []).filter((d) => d.status === 'active'),
    [allDoctors],
  );
  const ANY_DOCTOR = '__any__';

  // Fast-path duplicate detection: once the user types a full 12-digit IC,
  // look up an existing patient and surface their outstanding ledgers.
  // Only run for MyKad — usePatientByIc self-disables on non-12-digit input.
  const debouncedIc = useDebouncedValue(isMykadType ? (nationalId ?? '') : '', 300);
  const { data: existingPatient } = usePatientByIc(debouncedIc);
  const {
    patientOutstanding: existingPatientOutstanding,
    panelOutstanding: existingPanelOutstanding,
    hasPatientDebt: existingHasPatientDebt,
    hasPanelDebt: existingHasPanelDebt,
  } = usePatientOutstanding(existingPatient?.id);

  // MyKad auto-parse — only fills empty fields, never overrides manual input.
  useEffect(() => {
    if (!nationalId || !isMykadType) return;
    const { dob, gender } = parseMyKad(nationalId);
    if (dob && !dobValue) setValue('date_of_birth', dob, { shouldDirty: false });
    if (gender && !genderValue) setValue('gender', gender, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nationalId, isMykadType]);

  // If the IC matches an existing patient with a default panel, prefill payer.
  useEffect(() => {
    const defaultPanel = (existingPatient as { default_panel_id?: string | null } | null)
      ?.default_panel_id;
    if (defaultPanel) {
      setValue('payment_method', 'panel', { shouldDirty: false });
      setValue('panel_id', defaultPanel, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPatient?.id]);

  // Clear "loaded existing" state when IC is edited away from loaded value
  useEffect(() => {
    if (loadedIc && (nationalId ?? '') !== loadedIc) {
      setLoadedPatientId(null);
      setLoadedIc(null);
    }
  }, [nationalId, loadedIc]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      reset(EMPTY);
      setPrincipalQuery('');
      setSelectedPrincipal(null);
      setSubmitting(false);
      setLoadedPatientId(null);
      setLoadedIc(null);
      setAssignedDoctorId(null);
      setVisitRemarks('');
    }
  }, [open, reset]);

  const principalLabel = useMemo(() => {
    if (!selectedPrincipal) return null;
    return `${selectedPrincipal.name}${selectedPrincipal.national_id ? ` • ${selectedPrincipal.national_id}` : ''}`;
  }, [selectedPrincipal]);

  const handlePickPrincipal = (p: PatientRow) => {
    setSelectedPrincipal(p);
    setValue('principal_id', p.id, { shouldValidate: true });
    setPrincipalPickerOpen(false);
  };

  const handleClearPrincipal = () => {
    setSelectedPrincipal(null);
    setValue('principal_id', null, { shouldValidate: true });
  };

  const handleLoadExisting = () => {
    if (!existingPatient) return;
    const ep = existingPatient as PatientRow & {
      default_panel_id?: string | null;
      email?: string | null;
      panel_remarks?: string | null;
      id_type?: string | null;
    };
    reset({
      ...EMPTY,
      id_type: ((ep.id_type ?? 'mykad') as LocalIdType),
      national_id: ep.national_id ?? '',
      name: ep.name ?? '',
      phone: ep.phone ?? '',
      gender: (ep.gender as FormData['gender']) ?? '',
      date_of_birth: ep.date_of_birth ?? '',
      email: ep.email ?? '',
      visit_type: 'consultation',
      visit_purpose: 'consultation',
      payment_method: ep.default_panel_id ? 'panel' : 'cash',
      panel_id: ep.default_panel_id ?? null,
      panel_remarks: ep.panel_remarks ?? '',
    });
    setLoadedPatientId(ep.id);
    setLoadedIc(ep.national_id ?? '');
    toast.success(`Loaded existing patient: ${ep.name}`);
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const normalizedRemarks = (data.panel_remarks ?? '').trim() || null;

      // 1. Upsert patient — skip demographic mutations if user loaded an
      // existing record, but ALWAYS sync panel_remarks when it changed so
      // the nurse's RM-balance edit doesn't evaporate.
      const usingExisting =
        loadedPatientId && existingPatient && existingPatient.id === loadedPatientId;
      let patient: { id: string };
      if (usingExisting) {
        const existingRemarks =
          ((existingPatient as { panel_remarks?: string | null }).panel_remarks ?? null) || null;
        if (existingRemarks !== normalizedRemarks) {
          await updatePatient.mutateAsync({
            id: loadedPatientId!,
            patch: { panel_remarks: normalizedRemarks } as never,
          });
        }
        patient = { id: loadedPatientId! };
      } else {
        patient = await createPatient.mutateAsync({
          name: data.name,
          phone: data.phone || null,
          id_type: data.id_type,
          national_id: data.national_id || null,
          date_of_birth: data.date_of_birth || null,
          gender: data.gender || null,
          email: data.email || null,
          principal_id: data.is_dependent ? data.principal_id : null,
          relationship: data.is_dependent ? data.relationship || null : null,
          panel_remarks: normalizedRemarks,
        } as never);
      }

      // 2. Insert queue entry (today's ephemeral visit) with atomic daily sequence
      const { data: seq, error: seqError } = await supabase.rpc('get_next_queue_number');
      if (seqError) {
        toast.error(`Patient saved but failed to allocate queue number: ${seqError.message}`);
        qc.invalidateQueries({ queryKey: ['clinic', 'patients'] });
        return;
      }

      const isDirectSaleSubmit = data.visit_type === 'direct_sale';
      const { error: queueError } = await supabase.from('queue_entries').insert({
        patient_id: patient.id,
        clinic_status: isDirectSaleSubmit ? 'sent_to_dispensary' : 'registered',
        visit_type: data.visit_type,
        visit_purpose: isDirectSaleSubmit ? 'other' : data.visit_purpose,
        visit_notes: data.visit_notes || null,
        payment_method: data.payment_method,
        panel_id: data.payment_method === 'panel' ? data.panel_id : null,
        created_by: user?.id ?? null,
        queue_sequence: seq as number,
        assigned_doctor_id: isDirectSaleSubmit ? null : assignedDoctorId,
        visit_remarks: visitRemarks.trim() || null,
      });

      if (queueError) {
        toast.error(
          `Patient saved but queue entry failed: ${queueError.message}. Use Walk-In to retry check-in.`,
        );
        qc.invalidateQueries({ queryKey: ['clinic', 'patients'] });
        return;
      }

      qc.invalidateQueries({ queryKey: ['clinic', 'patients'] });
      qc.invalidateQueries({ queryKey: ['clinic', 'queue-entries'] });
      toast.success(
        isDirectSaleSubmit
          ? 'Direct sale visit created — routing to dispensary'
          : 'Patient registered and added to queue',
      );
      onOpenChange(false);
      navigate(isDirectSaleSubmit ? '/clinic/dispensary' : '/clinic/queue');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register patient';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register & Add to Queue</DialogTitle>
          <DialogDescription>
            Capture permanent patient details, optional principal linkage, and today's visit in
            one step.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* ─────────── Section 1: Demographics ─────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Patient Demographics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-id-type">ID Type *</Label>
                  <Select
                    value={idType}
                    onValueChange={(v) =>
                      setValue('id_type', v as LocalIdType, { shouldValidate: true, shouldDirty: true })
                    }
                  >
                    <SelectTrigger id="reg-id-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ID_TYPE_OPTIONS_LOCAL.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="reg-ic">{ID_LABELS[idType]}{isMykadType ? '' : ' *'}</Label>
                    {isMykadType && (
                      <ReadMyKadButton
                        onRead={(data) => {
                          // Hard reset: physical card read must not inherit a
                          // previously-loaded existing-patient binding.
                          setLoadedPatientId(null);
                          setLoadedIc(null);

                          setValue('id_type', 'mykad', { shouldValidate: true, shouldDirty: true });
                          if (data.name)
                            setValue('name', toMalayTitleCase(data.name), { shouldValidate: true, shouldDirty: true });
                          const ic = cleanIC(data.ic_no);
                          if (ic)
                            setValue('national_id', ic, { shouldValidate: true, shouldDirty: true });
                          const dob = mapDOB(data.dob);
                          if (dob)
                            setValue('date_of_birth', dob, { shouldValidate: true, shouldDirty: true });
                          const g = mapGender(data.gender);
                          if (g)
                            setValue('gender', g, { shouldValidate: true, shouldDirty: true });
                          toast.success('MyKad read successfully');
                        }}
                      />
                    )}
                  </div>
                  <Input
                    id="reg-ic"
                    placeholder={ID_PLACEHOLDERS[idType]}
                    {...register('national_id')}
                  />
                  {errors.national_id && (
                    <p className="text-sm text-destructive">{errors.national_id.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Full Name *</Label>
                  <Input id="reg-name" {...register('name')} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Phone *</Label>
                  <Input
                    id="reg-phone"
                    placeholder="+60 12 345 6789"
                    {...register('phone')}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-gender">Gender</Label>
                  <Select
                    value={genderValue || ''}
                    onValueChange={(v) => setValue('gender', v as FormData['gender'])}
                  >
                    <SelectTrigger id="reg-gender">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-dob">Date of Birth</Label>
                  <Input id="reg-dob" type="date" {...register('date_of_birth')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" {...register('email')} />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>

              {existingPatient && (
                <Alert variant="destructive">
                  <AlertDescription className="space-y-2">
                    <div>
                      ⚠️ A patient with this MyKad already exists:{' '}
                      <span className="font-semibold">{existingPatient.name}</span>
                      {existingPatient.phone ? ` • ${existingPatient.phone}` : ''}. Consider
                      using the existing record instead of creating a duplicate.
                    </div>
                    {existingHasPatientDebt && (
                      <div>
                        ⚠️ Patient Liability: {formatRm(existingPatientOutstanding)}. Please
                        collect this payment before proceeding.
                      </div>
                    )}
                    <div className="pt-1">
                      {loadedPatientId === existingPatient.id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          <Check className="h-3.5 w-3.5" /> Using existing record — submit will
                          only create the queue entry.
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleLoadExisting}
                        >
                          <UserCheck className="h-4 w-4" />
                          Load Existing Record
                        </Button>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {existingPatient && existingHasPanelDebt && (
                <Alert className="border-yellow-200 bg-yellow-50 text-yellow-800 [&>svg]:text-yellow-800">
                  <AlertDescription>
                    📄 Pending Panel Claims: {formatRm(existingPanelOutstanding)}. (Awaiting
                    disbursement from panel)
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* ─────────── Section 2: Dependant Linkage ─────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dependant Linkage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
                <div>
                  <Label htmlFor="reg-is-dep" className="text-sm font-medium">
                    Register as dependant of an existing patient
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Links this patient to a Principal (e.g. spouse, child, parent).
                  </p>
                </div>
                <Controller
                  control={control}
                  name="is_dependent"
                  render={({ field }) => (
                    <Switch
                      id="reg-is-dep"
                      checked={field.value}
                      onCheckedChange={(v) => {
                        field.onChange(v);
                        if (!v) {
                          setValue('principal_id', null);
                          setValue('relationship', '');
                          setSelectedPrincipal(null);
                        }
                      }}
                    />
                  )}
                />
              </div>

              {isDependent && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Principal Patient *</Label>
                    {selectedPrincipal ? (
                      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{selectedPrincipal.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {selectedPrincipal.national_id ?? 'No IC'} •{' '}
                            {selectedPrincipal.phone ?? 'No phone'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={handleClearPrincipal}
                          aria-label="Clear principal"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Popover open={principalPickerOpen} onOpenChange={setPrincipalPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Search className="h-4 w-4" />
                              Search principal by name or IC…
                            </span>
                            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="p-0 w-[--radix-popover-trigger-width]"
                          align="start"
                        >
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Type at least 2 characters…"
                              value={principalQuery}
                              onValueChange={setPrincipalQuery}
                            />
                            <CommandList>
                              {debouncedPrincipalQuery.length < 2 ? (
                                <CommandEmpty>Type to search principals…</CommandEmpty>
                              ) : searchingPrincipals ? (
                                <CommandEmpty>Searching…</CommandEmpty>
                              ) : principalResults.length === 0 ? (
                                <CommandEmpty>No principals found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {principalResults.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={p.id}
                                      onSelect={() => handlePickPrincipal(p)}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium truncate">{toMalayTitleCase(p.name)}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {p.national_id ?? 'No IC'} •{' '}
                                          {p.phone ?? 'No phone'}
                                        </p>
                                      </div>
                                      <Check
                                        className={cn(
                                          'h-4 w-4 shrink-0',
                                          selectedPrincipal?.id === p.id
                                            ? 'opacity-100'
                                            : 'opacity-0',
                                        )}
                                      />
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                    {errors.principal_id && (
                      <p className="text-sm text-destructive">{errors.principal_id.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reg-rel">Relationship *</Label>
                    <Controller
                      control={control}
                      name="relationship"
                      render={({ field }) => (
                        <Select value={field.value || ''} onValueChange={field.onChange}>
                          <SelectTrigger id="reg-rel">
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIPS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.relationship && (
                      <p className="text-sm text-destructive">{errors.relationship.message}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─────────── Section 3: Today's Visit ─────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today's Visit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Visit Type *</Label>
                <Controller
                  control={control}
                  name="visit_type"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      <label
                        htmlFor="vt-consult"
                        className={cn(
                          'flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer',
                          field.value === 'consultation' && 'border-primary bg-primary/5',
                        )}
                      >
                        <RadioGroupItem value="consultation" id="vt-consult" className="mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Consultation</p>
                          <p className="text-xs text-muted-foreground">
                            Patient sees a doctor first.
                          </p>
                        </div>
                      </label>
                      <label
                        htmlFor="vt-direct"
                        className={cn(
                          'flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer',
                          field.value === 'direct_sale' && 'border-primary bg-primary/5',
                        )}
                      >
                        <RadioGroupItem value="direct_sale" id="vt-direct" className="mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Direct Sale (OTC only)</p>
                          <p className="text-xs text-muted-foreground">
                            Counter sale. Skips doctor; OTC items only.
                          </p>
                        </div>
                      </label>
                    </RadioGroup>
                  )}
                />
              </div>

              {!isDirectSale && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-purpose">Purpose of Visit *</Label>
                    <Controller
                      control={control}
                      name="visit_purpose"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="reg-purpose">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISIT_PURPOSES.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-assigned-doctor">Assign Doctor (Optional)</Label>
                    <Select
                      value={assignedDoctorId ?? ANY_DOCTOR}
                      onValueChange={(v) => setAssignedDoctorId(v === ANY_DOCTOR ? null : v)}
                    >
                      <SelectTrigger id="reg-assigned-doctor">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY_DOCTOR}>Any Available Doctor</SelectItem>
                        {activeDoctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment Method *</Label>
                  <Controller
                    control={control}
                    name="payment_method"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v !== 'panel') setValue('panel_id', null);
                        }}
                        className="flex gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="cash" id="pm-cash" />
                          <Label htmlFor="pm-cash" className="font-normal cursor-pointer">
                            Cash
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="panel" id="pm-panel" />
                          <Label htmlFor="pm-panel" className="font-normal cursor-pointer">
                            Panel
                          </Label>
                        </div>
                      </RadioGroup>
                    )}
                  />
                </div>
              </div>

              {paymentMethod === 'panel' && (
                <div className="space-y-1.5">
                  <Label htmlFor="reg-panel">Panel Company *</Label>
                  <Controller
                    control={control}
                    name="panel_id"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <SelectTrigger id="reg-panel">
                          <SelectValue placeholder="Select panel" />
                        </SelectTrigger>
                        <SelectContent>
                          {panels.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No active panels
                            </div>
                          ) : (
                            panels.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.panel_id && (
                    <p className="text-sm text-destructive">{errors.panel_id.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="reg-panel-remarks">
                  Patient's Panel Balance / Remarks
                </Label>
                <Textarea
                  id="reg-panel-remarks"
                  rows={2}
                  placeholder="e.g. Balance RM 21 as of 2/2/26"
                  {...register('panel_remarks')}
                />
                <p className="text-xs text-muted-foreground">
                  Record remaining balance or limits (e.g. "Balance RM 21"). Shown to
                  doctors and dispensary on every visit, even when paying cash.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-notes">Visit Notes</Label>
                <Textarea
                  id="reg-notes"
                  rows={3}
                  placeholder="Symptoms, presenting complaint, urgency, etc."
                  {...register('visit_notes')}
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
              {submitting ? 'Saving…' : 'Register & Add to Queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
