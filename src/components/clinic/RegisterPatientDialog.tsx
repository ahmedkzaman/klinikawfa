import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreatePatient } from '@/hooks/clinic/usePatients';
import type { PatientRow } from '@/types/clinic';

const patientSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone is required')
    .max(20)
    .regex(/^[+]?[0-9\s-]+$/, 'Invalid phone number'),
  national_id: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[0-9]{12}$/.test(v.replace(/[-\s]/g, '')), {
      message: 'MyKad must be 12 digits',
    }),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  allergies: z.string().trim().max(500).optional(),
  underlying_conditions: z.string().trim().max(500).optional(),
});

type FormData = z.infer<typeof patientSchema>;

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
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: { name: '', phone: '' },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const created = await create.mutateAsync({
        name: data.name,
        phone: data.phone || null,
        national_id: data.national_id || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        email: data.email || null,
        allergies: data.allergies || null,
        underlying_conditions: data.underlying_conditions || null,
      });
      toast.success(`Patient registered: ${created.name}`);
      reset();
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register Patient</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Full name *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" placeholder="+60 12 345 6789" {...register('phone')} />
              {errors.phone && (
                <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="national_id">MyKad / IC</Label>
              <Input id="national_id" placeholder="12 digits" {...register('national_id')} />
              {errors.national_id && (
                <p className="text-sm text-destructive mt-1">{errors.national_id.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && (
              <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
            )}
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
