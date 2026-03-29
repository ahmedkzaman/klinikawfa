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
import { User, Edit, Send, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

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

const emptyProfile: ProfileData = {
  full_name: '', ic_passport: '', phone: '', email: '', home_address: '',
  bank_name: '', bank_account: '', emergency_contact_name: '', emergency_contact_phone: '',
  job_title: '', department: '',
};

function maskBankAccount(acc: string) {
  if (!acc || acc.length < 4) return acc;
  return '****' + acc.slice(-4);
}

export default function StaffProfile() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileData>(emptyProfile);

  // Get approved profile data from onboarding or latest approved submission
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

  // Build current approved data
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

      {/* Status Banners */}
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
    </div>
  );
}
