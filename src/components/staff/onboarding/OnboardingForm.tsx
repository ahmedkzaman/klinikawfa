import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const step1Schema = z.object({
  full_name: z.string().min(1, 'Required').max(200),
  preferred_name: z.string().max(100).optional().default(''),
  ic_passport: z.string().min(1, 'Required').max(50),
  dob: z.string().min(1, 'Required'),
  nationality: z.string().min(1, 'Required').max(100),
  race: z.string().max(100).optional().default(''),
  religion: z.string().max(100).optional().default(''),
  gender: z.string().min(1, 'Required'),
  permanent_address: z.string().min(1, 'Required').max(500),
  mailing_address: z.string().max(500).optional().default(''),
  mobile_phone: z.string().min(1, 'Required').max(20),
  personal_email: z.string().email('Invalid email').max(255),
  marital_status: z.string().min(1, 'Required'),
  emergency_name: z.string().min(1, 'Required').max(200),
  emergency_relationship: z.string().min(1, 'Required').max(100),
  emergency_mobile: z.string().min(1, 'Required').max(20),
  emergency_home_phone: z.string().max(20).optional().default(''),
  emergency_address: z.string().max(500).optional().default(''),
});

const step2Schema = z.object({
  highest_qualification: z.string().max(200).optional().default(''),
  graduation_year: z.string().max(10).optional().default(''),
  institution: z.string().max(300).optional().default(''),
  cgpa: z.string().max(20).optional().default(''),
  field_of_study: z.string().max(200).optional().default(''),
  additional_certs: z.string().max(1000).optional().default(''),
  nursing_cert: z.string().max(200).optional().default(''),
  position_title: z.string().min(1, 'Required').max(200),
  commencement_date: z.string().min(1, 'Required'),
  employment_type: z.string().min(1, 'Required'),
  department: z.string().max(200).optional().default(''),
  supervisor: z.string().min(1, 'Required').max(200),
  work_location: z.string().max(300).optional().default(''),
});

const step3Schema = z.object({
  bank_name: z.string().min(1, 'Required').max(200),
  bank_account_number: z.string().min(1, 'Required').max(50),
  account_holder_name: z.string().min(1, 'Required').max(200),
  account_type: z.string().max(50).optional().default(''),
  tax_ref: z.string().max(50).optional().default(''),
  epf_number: z.string().max(50).optional().default(''),
  socso_number: z.string().max(50).optional().default(''),
  hrdc_levy: z.string().optional().default(''),
  prior_clinic_experience: z.string().max(2000).optional().default(''),
  transport: z.string().optional().default(''),
  vehicle_reg: z.string().max(50).optional().default(''),
  driving_licence: z.string().max(50).optional().default(''),
});

const step4Schema = z.object({
  has_medical_conditions: z.string().min(1, 'Required'),
  medical_conditions_desc: z.string().max(2000).optional().default(''),
  food_allergies: z.string().max(500).optional().default(''),
  blood_type: z.string().max(10).optional().default(''),
  declaration_agreed: z.literal(true, { errorMap: () => ({ message: 'You must agree to the declaration' }) }),
});

interface OnboardingFormProps {
  userId: string;
  onComplete: () => void;
}

function FormField({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function OnboardingForm({ userId, onComplete }: OnboardingFormProps) {
  const [subStep, setSubStep] = useState(0);
  const [allData, setAllData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const subStepTitles = [
    '👤 Personal Information & 🚨 Emergency Contact',
    '🎓 Education & 📋 Employment Details',
    '🏦 Bank & Tax Details + 🏥 Clinic Experience',
    '🏥 Health Declaration & ✍️ Sign-Off',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Step 1: Onboarding Form — Part {subStep + 1} of 4
        </CardTitle>
        <p className="text-sm text-slate-500">{subStepTitles[subStep]}</p>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= subStep ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {subStep === 0 && (
          <SubStep1
            defaultValues={allData}
            onNext={(data) => { setAllData(prev => ({ ...prev, ...data })); setSubStep(1); }}
          />
        )}
        {subStep === 1 && (
          <SubStep2
            defaultValues={allData}
            onBack={() => setSubStep(0)}
            onNext={(data) => { setAllData(prev => ({ ...prev, ...data })); setSubStep(2); }}
          />
        )}
        {subStep === 2 && (
          <SubStep3
            defaultValues={allData}
            onBack={() => setSubStep(1)}
            onNext={(data) => { setAllData(prev => ({ ...prev, ...data })); setSubStep(3); }}
          />
        )}
        {subStep === 3 && (
          <SubStep4
            defaultValues={allData}
            onBack={() => setSubStep(2)}
            saving={saving}
            onSubmit={async (data) => {
              const finalData = { ...allData, ...data };
              setSaving(true);
              try {
                const { error } = await supabase
                  .from('staff_onboarding' as any)
                  .upsert({
                    user_id: userId,
                    onboarding_data: finalData,
                  } as any, { onConflict: 'user_id' });
                if (error) throw error;

                // Auto-sync to staff_payroll_profiles
                await (supabase as any)
                  .from('staff_payroll_profiles')
                  .upsert({
                    user_id: userId,
                    full_name: finalData.full_name || '',
                    nric_passport: finalData.ic_passport || '',
                    employment_type: finalData.employment_type || 'permanent',
                    job_title: finalData.position_title || '',
                    department: finalData.department || '',
                    date_joined: finalData.commencement_date || null,
                    bank_name: finalData.bank_name || '',
                    bank_account_number: finalData.bank_account_number || '',
                    account_holder_name: finalData.account_holder_name || '',
                    tax_id: finalData.tax_ref || '',
                    epf_reference: finalData.epf_number || '',
                    socso_reference: finalData.socso_number || '',
                  }, { onConflict: 'user_id' });
                toast.success('Onboarding form saved!');
                onComplete();
              } catch (err: any) {
                toast.error(err.message || 'Failed to save');
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SubStep1({ defaultValues, onNext }: { defaultValues: Record<string, any>; onNext: (d: any) => void }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(step1Schema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 1 — Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name (as per IC / Passport)" required error={errors.full_name?.message as string}>
            <Input {...register('full_name')} />
          </FormField>
          <FormField label="Preferred Name" error={errors.preferred_name?.message as string}>
            <Input {...register('preferred_name')} />
          </FormField>
          <FormField label="IC / Passport Number" required error={errors.ic_passport?.message as string}>
            <Input {...register('ic_passport')} />
          </FormField>
          <FormField label="Date of Birth" required error={errors.dob?.message as string}>
            <Input type="date" {...register('dob')} />
          </FormField>
          <FormField label="Nationality" required error={errors.nationality?.message as string}>
            <Input {...register('nationality')} />
          </FormField>
          <FormField label="Race / Ethnicity" error={errors.race?.message as string}>
            <Input {...register('race')} />
          </FormField>
          <FormField label="Religion" error={errors.religion?.message as string}>
            <Input {...register('religion')} />
          </FormField>
          <FormField label="Gender" required error={errors.gender?.message as string}>
            <Select onValueChange={(v) => setValue('gender', v)} defaultValue={watch('gender')}>
              <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="Permanent Address" required error={errors.permanent_address?.message as string}>
          <Textarea {...register('permanent_address')} rows={2} />
        </FormField>
        <FormField label="Current / Mailing Address (leave blank if same)" error={errors.mailing_address?.message as string}>
          <Textarea {...register('mailing_address')} rows={2} />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Mobile Phone" required error={errors.mobile_phone?.message as string}>
            <Input {...register('mobile_phone')} />
          </FormField>
          <FormField label="Personal Email" required error={errors.personal_email?.message as string}>
            <Input type="email" {...register('personal_email')} />
          </FormField>
          <FormField label="Marital Status" required error={errors.marital_status?.message as string}>
            <Select onValueChange={(v) => setValue('marital_status', v)} defaultValue={watch('marital_status')}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 2 — Emergency Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name" required error={errors.emergency_name?.message as string}>
            <Input {...register('emergency_name')} />
          </FormField>
          <FormField label="Relationship" required error={errors.emergency_relationship?.message as string}>
            <Input {...register('emergency_relationship')} />
          </FormField>
          <FormField label="Mobile Phone" required error={errors.emergency_mobile?.message as string}>
            <Input {...register('emergency_mobile')} />
          </FormField>
          <FormField label="Home Phone (optional)" error={errors.emergency_home_phone?.message as string}>
            <Input {...register('emergency_home_phone')} />
          </FormField>
        </div>
        <FormField label="Emergency Contact Address" error={errors.emergency_address?.message as string}>
          <Textarea {...register('emergency_address')} rows={2} />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Next →</Button>
      </div>
    </form>
  );
}

function SubStep2({ defaultValues, onBack, onNext }: { defaultValues: Record<string, any>; onBack: () => void; onNext: (d: any) => void }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(step2Schema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 3 — Education & Qualifications</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Highest Qualification">
            <Input {...register('highest_qualification')} />
          </FormField>
          <FormField label="Year of Graduation">
            <Input {...register('graduation_year')} />
          </FormField>
          <FormField label="Institution / University">
            <Input {...register('institution')} />
          </FormField>
          <FormField label="CGPA / Grade">
            <Input {...register('cgpa')} />
          </FormField>
          <FormField label="Field of Study / Major">
            <Input {...register('field_of_study')} />
          </FormField>
          <FormField label="Nursing / Medical Certificate (if any)">
            <Input {...register('nursing_cert')} placeholder="e.g. SRN, Diploma in Nursing" />
          </FormField>
        </div>
        <FormField label="Additional Certifications / Skills">
          <Textarea {...register('additional_certs')} rows={2} placeholder="e.g. BLS, first aid, pharmacy assistant cert" />
        </FormField>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 4 — Employment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Position Title" required error={errors.position_title?.message as string}>
            <Input {...register('position_title')} />
          </FormField>
          <FormField label="Commencement Date" required error={errors.commencement_date?.message as string}>
            <Input type="date" {...register('commencement_date')} />
          </FormField>
          <FormField label="Employment Type" required error={errors.employment_type?.message as string}>
            <Select onValueChange={(v) => setValue('employment_type', v)} defaultValue={watch('employment_type')}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full-Time Staff</SelectItem>
                <SelectItem value="part_time">Part-Time Staff</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
                <SelectItem value="contract">Contract / Temporary</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Department / Unit">
            <Input {...register('department')} placeholder="e.g. Clinical, Front Desk, Pharmacy" />
          </FormField>
          <FormField label="Direct Supervisor / Reports To" required error={errors.supervisor?.message as string}>
            <Input {...register('supervisor')} />
          </FormField>
          <FormField label="Work Location(s)">
            <Input {...register('work_location')} placeholder="e.g. Klinik Awfa Bangi" />
          </FormField>
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <Button type="submit">Next →</Button>
      </div>
    </form>
  );
}

function SubStep3({ defaultValues, onBack, onNext }: { defaultValues: Record<string, any>; onBack: () => void; onNext: (d: any) => void }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<z.infer<typeof step3Schema>>({
    resolver: zodResolver(step3Schema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 5 — Bank Account Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Bank Name" required error={errors.bank_name?.message as string}>
            <Input {...register('bank_name')} />
          </FormField>
          <FormField label="Bank Account Number" required error={errors.bank_account_number?.message as string}>
            <Input {...register('bank_account_number')} />
          </FormField>
          <FormField label="Account Holder Name" required error={errors.account_holder_name?.message as string}>
            <Input {...register('account_holder_name')} />
          </FormField>
          <FormField label="Account Type (Savings / Current)">
            <Input {...register('account_type')} />
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 6 — Tax, EPF & SOCSO</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Income Tax Reference No.">
            <Input {...register('tax_ref')} />
          </FormField>
          <FormField label="EPF / KWSP Number">
            <Input {...register('epf_number')} />
          </FormField>
          <FormField label="SOCSO / PERKESO Number">
            <Input {...register('socso_number')} />
          </FormField>
          <FormField label="HRDC Levy Applicable?">
            <Select onValueChange={(v) => setValue('hrdc_levy', v)} defaultValue={watch('hrdc_levy')}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 7 — Clinic Experience & Transport</h3>
        <FormField label="Prior clinic / healthcare experience (describe)">
          <Textarea {...register('prior_clinic_experience')} rows={3} placeholder="e.g. 2 years as clinic assistant at Klinik XYZ, pharmacy dispensing experience..." />
        </FormField>
        <FormField label="Own Transport?">
          <Select onValueChange={(v) => setValue('transport', v)} defaultValue={watch('transport')}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="car">Yes — Car</SelectItem>
              <SelectItem value="motorcycle">Yes — Motorcycle</SelectItem>
              <SelectItem value="no">No (will arrange transport)</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Vehicle Registration No.">
            <Input {...register('vehicle_reg')} />
          </FormField>
          <FormField label="Driving Licence Class">
            <Input {...register('driving_licence')} />
          </FormField>
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <Button type="submit">Next →</Button>
      </div>
    </form>
  );
}

function SubStep4({ defaultValues, onBack, saving, onSubmit }: { defaultValues: Record<string, any>; onBack: () => void; saving: boolean; onSubmit: (d: any) => void }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<z.infer<typeof step4Schema>>({
    resolver: zodResolver(step4Schema),
    defaultValues: { ...defaultValues, declaration_agreed: defaultValues.declaration_agreed || false } as any,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 8 — Health & Medical Declaration</h3>
        <FormField label="Do you have any medical conditions relevant to your work?" required error={errors.has_medical_conditions?.message as string}>
          <Select onValueChange={(v) => setValue('has_medical_conditions', v)} defaultValue={watch('has_medical_conditions')}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {watch('has_medical_conditions') === 'yes' && (
          <FormField label="Please describe (kept strictly confidential)">
            <Textarea {...register('medical_conditions_desc')} rows={3} />
          </FormField>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Food Allergies (for team events / catering)">
            <Input {...register('food_allergies')} />
          </FormField>
          <FormField label="Blood Type (optional)">
            <Input {...register('blood_type')} />
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-base border-b pb-2">Section 9 — Declaration & Sign-Off</h3>
        <div className="bg-slate-50 rounded-md p-4 text-sm text-slate-500">
          I, the undersigned, hereby confirm that all information provided in this form is true, accurate, and complete to the best of my knowledge. I understand that providing false or misleading information may result in termination of my employment with Klinik Awfa. I agree to comply with all clinic policies, code of conduct, standard operating procedures, and all applicable laws and regulations. I acknowledge receipt of the Job Scope Document and the terms of my engagement with Klinik Awfa.
        </div>
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={watch('declaration_agreed') === true}
            onCheckedChange={(checked) => setValue('declaration_agreed', checked === true ? true : false as any)}
          />
          <span className="text-sm">
            I agree to the declaration above <span className="text-destructive">*</span>
          </span>
        </label>
        {errors.declaration_agreed && <p className="text-xs text-destructive">{errors.declaration_agreed.message as string}</p>}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save & Continue →'}
        </Button>
      </div>
    </form>
  );
}
