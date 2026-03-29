import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { User, Edit, Send, CheckCircle, Clock, XCircle, DollarSign } from 'lucide-react';

type ProfileData = {
  full_name: string;
  ic_passport: string;
  phone: string;
  email: string;
  home_address: string;
  bank_name: string;
  bank_account: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  job_title: string;
  department: string;
};

type PayrollProfile = {
  employment_type: string;
  date_joined: string | null;
  salary_payment_type: string;
  bank_name: string;
  bank_account_number: string;
  account_holder_name: string;
  fixed_allowance: number;
  transport_allowance: number;
  meal_allowance: number;
  oncall_allowance: number;
  custom_allowance: number;
  payroll_status: string;
};

const emptyProfile: ProfileData = {
  full_name: '', ic_passport: '', phone: '', email: '', home_address: '',
  bank_name: '', bank_account: '', emergency_contact_name: '', emergency_contact_phone: '',
  job_title: '', department: '',
};

function maskBankAccount(acc: string) {
  if (!acc || acc.length < 4) return acc;
  return '****' + acc.slice(-4);
}

function PayrollInfoSection({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { data: payrollProfile } = useQuery({
    queryKey: ['my-payroll-profile', userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('staff_payroll_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return data as PayrollProfile | null;
    },
  });

  if (!payrollProfile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Payroll Info</CardTitle>
          <CardDescription>No payroll profile configured yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const items: [string, string][] = [
    ['Employment Type', payrollProfile.employment_type || '-'],
    ['Date Joined', payrollProfile.date_joined || '-'],
    ['Salary Payment Type', payrollProfile.salary_payment_type || '-'],
    ['Bank Name', payrollProfile.bank_name || '-'],
    ['Bank Account', isAdmin ? (payrollProfile.bank_account_number || '-') : maskBankAccount(payrollProfile.bank_account_number || '')],
    ['Account Holder', payrollProfile.account_holder_name || '-'],
    ['Payroll Status', payrollProfile.payroll_status || '-'],
  ];

  const allowances: [string, number][] = [
    ['APC Allowance', (payrollProfile as any).apc_allowance],
    ['Telephone Allowance', (payrollProfile as any).telephone_allowance],
    ['Team Leader Allowance', (payrollProfile as any).team_leader_allowance],
    ['Project Allowance', (payrollProfile as any).project_allowance],
    ['Admin Allowance', (payrollProfile as any).admin_allowance],
    ['Fixed Allowance', payrollProfile.fixed_allowance],
    ['Transport Allowance', payrollProfile.transport_allowance],
    ['Meal Allowance', payrollProfile.meal_allowance],
    ['On-Call Allowance', payrollProfile.oncall_allowance],
    ['Custom Allowance', payrollProfile.custom_allowance],
    ...(((payrollProfile as any).other_allowance_name && (payrollProfile as any).other_allowance_amount) ? [[(payrollProfile as any).other_allowance_name, (payrollProfile as any).other_allowance_amount] as [string, number]] : []),
  ];

  const statutoryDeductions: [string, number][] = [
    ['EPF (Employee)', (payrollProfile as any).epf_employee],
    ['EPF (Employer)', (payrollProfile as any).epf_employer],
    ['SOCSO (Employee)', (payrollProfile as any).socso_employee],
    ['SOCSO (Employer)', (payrollProfile as any).socso_employer],
    ['EIS (Employee)', (payrollProfile as any).eis_employee],
    ['EIS (Employer)', (payrollProfile as any).eis_employer],
    ['HRDF', (payrollProfile as any).hrdf],
    ['MTD / PCB', (payrollProfile as any).mtd],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Payroll Info</CardTitle>
        <CardDescription>Read-only payroll details{!isAdmin ? ' (limited view)' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <Label>{label}</Label>
            <p className="text-sm py-2 px-3 bg-muted rounded-md">{value}</p>
          </div>
        ))}
        {isAdmin && (
          <>
            <Label className="mt-4 block font-semibold">Allowances</Label>
            {allowances.map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm py-1">
                <span className="text-muted-foreground">{label}</span>
                <span>RM {(value || 0).toFixed(2)}</span>
              </div>
            ))}
            <Label className="mt-4 block font-semibold">Statutory Deductions</Label>
            {statutoryDeductions.map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm py-1">
                <span className="text-muted-foreground">{label}</span>
                <span>RM {(value || 0).toFixed(2)}</span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function StaffProfile() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileData>(emptyProfile);

  const { data: onboarding } = useQuery({
    queryKey: ['my-onboarding', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('staff_onboarding').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: latestSubmission } = useQuery({
    queryKey: ['my-profile-submission', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_profile_submissions')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const currentData = useMemo((): ProfileData => {
    const ob = onboarding?.onboarding_data as Record<string, any> | null;
    return {
      full_name: profile?.full_name || ob?.fullName || '',
      ic_passport: ob?.icNumber || '',
      phone: profile?.phone || ob?.phone || '',
      email: profile?.email || '',
      home_address: ob?.address || '',
      bank_name: ob?.bankName || '',
      bank_account: ob?.bankAccount || '',
      emergency_contact_name: ob?.emergencyContactName || '',
      emergency_contact_phone: ob?.emergencyContactPhone || '',
      job_title: profile?.position || '',
      department: profile?.department || '',
    };
  }, [onboarding, profile]);

  useEffect(() => {
    if (!editing) setFormData(currentData);
  }, [currentData, editing]);

  const submitMutation = useMutation({
    mutationFn: async (data: ProfileData) => {
      const { error } = await supabase.from('staff_profile_submissions').insert({
        user_id: user!.id,
        profile_data: data as any,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile update submitted for approval');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-profile-submission'] });
    },
    onError: () => toast.error('Failed to submit profile update'),
  });

  const pendingSubmission = latestSubmission?.status === 'pending';
  const rejectedSubmission = latestSubmission?.status === 'rejected';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  const updateField = (key: keyof ProfileData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><User className="h-6 w-6" /> My Profile</h1>
        {!editing && !pendingSubmission && (
          <Button onClick={() => setEditing(true)}><Edit className="h-4 w-4 mr-2" /> Edit Profile</Button>
        )}
      </div>

      {pendingSubmission && (
        <Alert><Clock className="h-4 w-4" /><AlertTitle>Pending Review</AlertTitle>
          <AlertDescription>Your profile update is awaiting admin approval.</AlertDescription></Alert>
      )}
      {rejectedSubmission && (
        <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>Update Rejected</AlertTitle>
          <AlertDescription>
            Reason: {latestSubmission?.rejection_reason || 'No reason provided'}
            <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => {
              const rd = latestSubmission?.profile_data as any;
              if (rd) setFormData(rd);
              setEditing(true);
            }}>Resubmit</Button>
          </AlertDescription>
        </Alert>
      )}
      {latestSubmission?.status === 'approved' && (
        <Alert className="border-green-200 bg-green-50"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-700">Profile Approved</AlertTitle>
          <AlertDescription className="text-green-600">Your latest profile update has been approved.</AlertDescription></Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>{editing ? 'Update your information and submit for approval' : 'Your current profile information'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {([
              ['full_name', 'Full Name'],
              ['ic_passport', 'IC / Passport Number'],
              ['phone', 'Phone Number'],
              ['email', 'Email'],
              ['home_address', 'Home Address'],
              ['bank_name', 'Bank Name'],
              ['bank_account', 'Bank Account Number'],
              ['emergency_contact_name', 'Emergency Contact Name'],
              ['emergency_contact_phone', 'Emergency Contact Phone'],
              ['job_title', 'Job Title'],
              ['department', 'Department'],
            ] as [keyof ProfileData, string][]).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={key}>{label}</Label>
                {editing ? (
                  key === 'home_address' ? (
                    <Textarea id={key} value={formData[key]} onChange={e => updateField(key, e.target.value)} />
                  ) : (
                    <Input id={key} value={formData[key]} onChange={e => updateField(key, e.target.value)} />
                  )
                ) : (
                  <p className="text-sm py-2 px-3 bg-muted rounded-md min-h-[40px] flex items-center">
                    {key === 'bank_account' && !isAdmin ? maskBankAccount(currentData[key]) : (currentData[key] || '-')}
                  </p>
                )}
              </div>
            ))}

            {editing && (
              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={submitMutation.isPending}>
                  <Send className="h-4 w-4 mr-2" /> Submit for Approval
                </Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(false); setFormData(currentData); }}>Cancel</Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Payroll Info Section */}
      {user && <PayrollInfoSection userId={user.id} isAdmin={isAdmin} />}
    </div>
  );
}
