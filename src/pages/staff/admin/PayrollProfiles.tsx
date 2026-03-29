import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { DollarSign, Edit, Plus, Search, Save, X, RefreshCw } from 'lucide-react';

type PayrollProfile = {
  id?: string;
  user_id: string;
  employee_id: string;
  full_name: string;
  nric_passport: string;
  employment_type: string;
  job_title: string;
  department: string;
  date_joined: string;
  resignation_date: string;
  payroll_status: string;
  bank_name: string;
  bank_account_number: string;
  account_holder_name: string;
  salary_payment_type: string;
  basic_salary: number;
  daily_rate: number;
  hourly_rate: number;
  overtime_eligible: boolean;
  overtime_rate: number;
  fixed_allowance: number;
  transport_allowance: number;
  meal_allowance: number;
  oncall_allowance: number;
  custom_allowance: number;
  unpaid_leave_deduction: number;
  lateness_deduction: number;
  absence_deduction: number;
  custom_deduction: number;
  tax_id: string;
  epf_reference: string;
  socso_reference: string;
  other_statutory_ref: string;
  payroll_notes: string;
};

const emptyProfile: Omit<PayrollProfile, 'user_id'> = {
  employee_id: '', full_name: '', nric_passport: '', employment_type: 'permanent',
  job_title: '', department: '', date_joined: '', resignation_date: '', payroll_status: 'active',
  bank_name: '', bank_account_number: '', account_holder_name: '', salary_payment_type: 'monthly',
  basic_salary: 0, daily_rate: 0, hourly_rate: 0, overtime_eligible: false, overtime_rate: 0,
  fixed_allowance: 0, transport_allowance: 0, meal_allowance: 0, oncall_allowance: 0, custom_allowance: 0,
  unpaid_leave_deduction: 0, lateness_deduction: 0, absence_deduction: 0, custom_deduction: 0,
  tax_id: '', epf_reference: '', socso_reference: '', other_statutory_ref: '', payroll_notes: '',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-muted text-muted-foreground',
  suspended: 'bg-destructive/10 text-destructive',
};

export default function PayrollProfiles() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingProfile, setEditingProfile] = useState<PayrollProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: profiles } = useQuery({
    queryKey: ['all-profiles-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email, department, position');
      return data || [];
    },
  });

  const { data: payrollProfiles, isLoading } = useQuery({
    queryKey: ['admin-payroll-profiles'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff_payroll_profiles').select('*');
      return (data || []) as (PayrollProfile & { id: string })[];
    },
  });

  const { data: onboardingData } = useQuery({
    queryKey: ['all-onboarding-data'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff_onboarding').select('user_id, onboarding_data');
      return (data || []) as unknown as { user_id: string; onboarding_data: Record<string, any> | null }[];
    },
  });

  const onboardingMap = Object.fromEntries((onboardingData || []).map(o => [o.user_id, o.onboarding_data]));

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const payrollMap = Object.fromEntries((payrollProfiles || []).map(p => [p.user_id, p]));

  const upsertMutation = useMutation({
    mutationFn: async (profile: PayrollProfile) => {
      const existing = payrollMap[profile.user_id];
      if (existing) {
        const { error } = await (supabase as any)
          .from('staff_payroll_profiles')
          .update(profile)
          .eq('user_id', profile.user_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('staff_payroll_profiles')
          .insert(profile);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Payroll profile saved');
      queryClient.invalidateQueries({ queryKey: ['admin-payroll-profiles'] });
      setDialogOpen(false);
      setEditingProfile(null);
    },
    onError: () => toast.error('Failed to save payroll profile'),
  });

  const handleEdit = (userId: string) => {
    const existing = payrollMap[userId];
    const staffProfile = profileMap[userId];
    if (existing) {
      setEditingProfile({ ...existing });
    } else {
      const ob = onboardingMap[userId] || {};
      setEditingProfile({
        ...emptyProfile,
        user_id: userId,
        full_name: ob.full_name || staffProfile?.full_name || '',
        nric_passport: ob.ic_passport || '',
        employment_type: ob.employment_type || 'permanent',
        job_title: ob.position_title || staffProfile?.position || '',
        department: ob.department || staffProfile?.department || '',
        date_joined: ob.commencement_date || '',
        bank_name: ob.bank_name || '',
        bank_account_number: ob.bank_account_number || '',
        account_holder_name: ob.account_holder_name || '',
        tax_id: ob.tax_ref || '',
        epf_reference: ob.epf_number || '',
        socso_reference: ob.socso_number || '',
      });
    }
    setDialogOpen(true);
  };

  const handleCreateNew = () => {
    if (!selectedUserId) return;
    handleEdit(selectedUserId);
    setSelectedUserId('');
  };

  const staffWithoutPayroll = (profiles || []).filter(p => !payrollMap[p.id]);

  const enrichedPayroll = (payrollProfiles || []).map(pp => ({
    ...pp,
    email: profileMap[pp.user_id]?.email || '',
    profileName: profileMap[pp.user_id]?.full_name || pp.full_name || 'Unknown',
  }));

  const filtered = enrichedPayroll.filter(p =>
    p.profileName.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const updateField = <K extends keyof PayrollProfile>(key: K, value: PayrollProfile[K]) => {
    setEditingProfile(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = () => {
    if (!editingProfile) return;
    upsertMutation.mutate(editingProfile);
  };

  const bulkSyncMutation = useMutation({
    mutationFn: async () => {
      const staffWithOnboarding = (onboardingData || []).filter(o => o.onboarding_data && !payrollMap[o.user_id]);
      if (staffWithOnboarding.length === 0) throw new Error('No staff to sync — all onboarded staff already have payroll profiles.');
      for (const o of staffWithOnboarding) {
        const ob = o.onboarding_data || {};
        const staffProfile = profileMap[o.user_id];
        await (supabase as any).from('staff_payroll_profiles').upsert({
          user_id: o.user_id,
          full_name: ob.full_name || staffProfile?.full_name || '',
          nric_passport: ob.ic_passport || '',
          employment_type: ob.employment_type || 'permanent',
          job_title: ob.position_title || staffProfile?.position || '',
          department: ob.department || staffProfile?.department || '',
          date_joined: ob.commencement_date || null,
          bank_name: ob.bank_name || '',
          bank_account_number: ob.bank_account_number || '',
          account_holder_name: ob.account_holder_name || '',
          tax_id: ob.tax_ref || '',
          epf_reference: ob.epf_number || '',
          socso_reference: ob.socso_number || '',
        }, { onConflict: 'user_id' });
      }
      return staffWithOnboarding.length;
    },
    onSuccess: (count) => {
      toast.success(`Synced ${count} payroll profile(s) from onboarding data`);
      queryClient.invalidateQueries({ queryKey: ['admin-payroll-profiles'] });
    },
    onError: (err: any) => toast.error(err.message || 'Bulk sync failed'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Payroll Profiles</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => bulkSyncMutation.mutate()} disabled={bulkSyncMutation.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${bulkSyncMutation.isPending ? 'animate-spin' : ''}`} />
          {bulkSyncMutation.isPending ? 'Syncing...' : 'Bulk Sync from Onboarding'}
        </Button>
      </div>

      {/* Add new payroll profile */}
      {staffWithoutPayroll.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <Label>Add Payroll Profile for Staff</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {staffWithoutPayroll.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateNew} disabled={!selectedUserId}>
                <Plus className="h-4 w-4 mr-2" /> Create Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff Payroll Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No payroll profiles found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Basic Salary</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.profileName}</TableCell>
                      <TableCell>{p.employee_id || '-'}</TableCell>
                      <TableCell className="capitalize">{p.employment_type || '-'}</TableCell>
                      <TableCell className="capitalize">{p.salary_payment_type || '-'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[p.payroll_status] || ''}>{p.payroll_status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">RM {(p.basic_salary || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(p.user_id)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingProfile(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payroll Profile — {editingProfile?.full_name || 'Staff'}</DialogTitle>
          </DialogHeader>
          {editingProfile && (
            <div className="space-y-6">
              {/* Employment */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Employment</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Employee ID</Label><Input value={editingProfile.employee_id} onChange={e => updateField('employee_id', e.target.value)} /></div>
                  <div><Label>Full Name</Label><Input value={editingProfile.full_name} onChange={e => updateField('full_name', e.target.value)} /></div>
                  <div><Label>NRIC / Passport</Label><Input value={editingProfile.nric_passport} onChange={e => updateField('nric_passport', e.target.value)} /></div>
                  <div>
                    <Label>Employment Type</Label>
                    <Select value={editingProfile.employment_type} onValueChange={v => updateField('employment_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanent">Permanent</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="locum">Locum</SelectItem>
                        <SelectItem value="part-time">Part-Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Job Title</Label><Input value={editingProfile.job_title} onChange={e => updateField('job_title', e.target.value)} /></div>
                  <div><Label>Department</Label><Input value={editingProfile.department} onChange={e => updateField('department', e.target.value)} /></div>
                  <div><Label>Date Joined</Label><Input type="date" value={editingProfile.date_joined || ''} onChange={e => updateField('date_joined', e.target.value)} /></div>
                  <div><Label>Resignation Date</Label><Input type="date" value={editingProfile.resignation_date || ''} onChange={e => updateField('resignation_date', e.target.value)} /></div>
                  <div>
                    <Label>Payroll Status</Label>
                    <Select value={editingProfile.payroll_status} onValueChange={v => updateField('payroll_status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* Bank Details */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bank Details</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Bank Name</Label><Input value={editingProfile.bank_name} onChange={e => updateField('bank_name', e.target.value)} /></div>
                  <div><Label>Account Number</Label><Input value={editingProfile.bank_account_number} onChange={e => updateField('bank_account_number', e.target.value)} /></div>
                  <div className="col-span-2"><Label>Account Holder Name</Label><Input value={editingProfile.account_holder_name} onChange={e => updateField('account_holder_name', e.target.value)} /></div>
                </div>
              </fieldset>

              {/* Salary */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Salary & Rates</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Payment Type</Label>
                    <Select value={editingProfile.salary_payment_type} onValueChange={v => updateField('salary_payment_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Basic Salary (RM)</Label><Input type="number" step="0.01" value={editingProfile.basic_salary} onChange={e => updateField('basic_salary', Number(e.target.value))} /></div>
                  <div><Label>Daily Rate (RM)</Label><Input type="number" step="0.01" value={editingProfile.daily_rate} onChange={e => updateField('daily_rate', Number(e.target.value))} /></div>
                  <div><Label>Hourly Rate (RM)</Label><Input type="number" step="0.01" value={editingProfile.hourly_rate} onChange={e => updateField('hourly_rate', Number(e.target.value))} /></div>
                  <div className="flex items-center gap-3 col-span-2">
                    <Switch checked={editingProfile.overtime_eligible} onCheckedChange={v => updateField('overtime_eligible', v)} />
                    <Label>Overtime Eligible</Label>
                  </div>
                  {editingProfile.overtime_eligible && (
                    <div><Label>OT Rate (RM)</Label><Input type="number" step="0.01" value={editingProfile.overtime_rate} onChange={e => updateField('overtime_rate', Number(e.target.value))} /></div>
                  )}
                </div>
              </fieldset>

              {/* Allowances */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Allowances</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Fixed (RM)</Label><Input type="number" step="0.01" value={editingProfile.fixed_allowance} onChange={e => updateField('fixed_allowance', Number(e.target.value))} /></div>
                  <div><Label>Transport (RM)</Label><Input type="number" step="0.01" value={editingProfile.transport_allowance} onChange={e => updateField('transport_allowance', Number(e.target.value))} /></div>
                  <div><Label>Meal (RM)</Label><Input type="number" step="0.01" value={editingProfile.meal_allowance} onChange={e => updateField('meal_allowance', Number(e.target.value))} /></div>
                  <div><Label>On-Call (RM)</Label><Input type="number" step="0.01" value={editingProfile.oncall_allowance} onChange={e => updateField('oncall_allowance', Number(e.target.value))} /></div>
                  <div><Label>Custom (RM)</Label><Input type="number" step="0.01" value={editingProfile.custom_allowance} onChange={e => updateField('custom_allowance', Number(e.target.value))} /></div>
                </div>
              </fieldset>

              {/* Deductions */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Deductions</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Unpaid Leave (RM)</Label><Input type="number" step="0.01" value={editingProfile.unpaid_leave_deduction} onChange={e => updateField('unpaid_leave_deduction', Number(e.target.value))} /></div>
                  <div><Label>Lateness (RM)</Label><Input type="number" step="0.01" value={editingProfile.lateness_deduction} onChange={e => updateField('lateness_deduction', Number(e.target.value))} /></div>
                  <div><Label>Absence (RM)</Label><Input type="number" step="0.01" value={editingProfile.absence_deduction} onChange={e => updateField('absence_deduction', Number(e.target.value))} /></div>
                  <div><Label>Custom (RM)</Label><Input type="number" step="0.01" value={editingProfile.custom_deduction} onChange={e => updateField('custom_deduction', Number(e.target.value))} /></div>
                </div>
              </fieldset>

              {/* Statutory */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Statutory / Tax</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tax ID</Label><Input value={editingProfile.tax_id} onChange={e => updateField('tax_id', e.target.value)} /></div>
                  <div><Label>EPF Reference</Label><Input value={editingProfile.epf_reference} onChange={e => updateField('epf_reference', e.target.value)} /></div>
                  <div><Label>SOCSO Reference</Label><Input value={editingProfile.socso_reference} onChange={e => updateField('socso_reference', e.target.value)} /></div>
                  <div><Label>Other Statutory Ref</Label><Input value={editingProfile.other_statutory_ref} onChange={e => updateField('other_statutory_ref', e.target.value)} /></div>
                </div>
              </fieldset>

              {/* Notes */}
              <div>
                <Label>Payroll Notes</Label>
                <Textarea value={editingProfile.payroll_notes} onChange={e => updateField('payroll_notes', e.target.value)} rows={3} />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingProfile(null); }}>
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
                <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" /> Save Profile
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
