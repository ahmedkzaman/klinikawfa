import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Check, X, Eye } from 'lucide-react';
import { format } from 'date-fns';

type Submission = {
  id: string;
  user_id: string;
  profile_data: Record<string, any>;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function ProfileApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: submissions } = useQuery({
    queryKey: ['profile-submissions', filter],
    queryFn: async () => {
      let query = supabase.from('staff_profile_submissions').select('*').order('created_at', { ascending: false });
      if (filter === 'pending') query = query.eq('status', 'pending');
      const { data } = await query;
      return (data || []) as Submission[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles-map'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      const map: Record<string, { full_name: string | null; email: string }> = {};
      data?.forEach(p => { map[p.id] = p; });
      return map;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (submission: Submission) => {
      // Update submission status
      const { error: updateError } = await supabase.from('staff_profile_submissions')
        .update({ status: 'approved', reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq('id', submission.id);
      if (updateError) throw updateError;

      // Update onboarding data with approved profile
      const pd = submission.profile_data;
      const { error: onboardError } = await supabase.from('staff_onboarding')
        .update({
          onboarding_data: {
            fullName: pd.full_name,
            icNumber: pd.ic_passport,
            phone: pd.phone,
            address: pd.home_address,
            bankName: pd.bank_name,
            bankAccount: pd.bank_account,
            emergencyContactName: pd.emergency_contact_name,
            emergencyContactPhone: pd.emergency_contact_phone,
          },
        })
        .eq('user_id', submission.user_id);

      // Update profiles table
      await supabase.from('profiles').update({
        full_name: pd.full_name,
        phone: pd.phone,
        position: pd.job_title,
        department: pd.department,
      }).eq('id', submission.user_id);
    },
    onSuccess: () => {
      toast.success('Profile approved');
      setSelectedSubmission(null);
      queryClient.invalidateQueries({ queryKey: ['profile-submissions'] });
    },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from('staff_profile_submissions')
        .update({ status: 'rejected', rejection_reason: reason, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile rejected');
      setShowRejectDialog(false);
      setSelectedSubmission(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['profile-submissions'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  const statusBadge = (status: string) => {
    if (status === 'approved') return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  const fieldLabels: Record<string, string> = {
    full_name: 'Full Name', ic_passport: 'IC/Passport', phone: 'Phone', email: 'Email',
    home_address: 'Home Address', bank_name: 'Bank Name', bank_account: 'Bank Account',
    emergency_contact_name: 'Emergency Contact', emergency_contact_phone: 'Emergency Phone',
    job_title: 'Job Title', department: 'Department',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profile Approvals</h1>

      <div className="flex gap-2">
        <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('pending')}>Pending</Button>
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions?.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No submissions found</TableCell></TableRow>
              )}
              {submissions?.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{profiles?.[s.user_id]?.full_name || profiles?.[s.user_id]?.email || s.user_id}</TableCell>
                  <TableCell>{format(new Date(s.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSubmission(s)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={open => { if (!open) setSelectedSubmission(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Profile Submission</DialogTitle></DialogHeader>
          {selectedSubmission && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                From: {profiles?.[selectedSubmission.user_id]?.full_name || profiles?.[selectedSubmission.user_id]?.email}
              </p>
              <div className="space-y-2">
                {Object.entries(selectedSubmission.profile_data).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm border-b pb-1">
                    <span className="text-slate-500">{fieldLabels[key] || key}</span>
                    <span className="font-medium text-right max-w-[60%]">{String(value) || '-'}</span>
                  </div>
                ))}
              </div>
              {selectedSubmission.rejection_reason && (
                <div className="bg-red-50 p-3 rounded-md text-sm">
                  <strong>Rejection reason:</strong> {selectedSubmission.rejection_reason}
                </div>
              )}
              {selectedSubmission.status === 'pending' && (
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={() => approveMutation.mutate(selectedSubmission)} disabled={approveMutation.isPending}>
                    <Check className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setShowRejectDialog(true)}>
                    <X className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Profile Update</DialogTitle></DialogHeader>
          <Textarea placeholder="Provide a reason for rejection..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectionReason.trim() || rejectMutation.isPending}
              onClick={() => { if (selectedSubmission) rejectMutation.mutate({ id: selectedSubmission.id, reason: rejectionReason }); }}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
