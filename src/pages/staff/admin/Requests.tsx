import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Trash2, CalendarOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

export default function AdminRequests() {
  const { user } = useAuth();
  const [deleteRequests, setDeleteRequests] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { fetchDeleteRequests(); fetchLeaveRequests(); }, []);

  const fetchDeleteRequests = async () => {
    const { data: requests } = await supabase.from('task_delete_requests').select('*').order('created_at', { ascending: false });
    if (!requests || requests.length === 0) { setDeleteRequests([]); return; }
    const taskIds = [...new Set(requests.map((r: any) => r.task_id))];
    const userIds = [...new Set(requests.map((r: any) => r.requested_by))];
    const [{ data: tasks }, { data: profiles }] = await Promise.all([
      supabase.from('staff_tasks').select('id, title').in('id', taskIds),
      supabase.from('profiles').select('id, full_name').in('id', userIds),
    ]);
    const tm: Record<string, string> = {}; tasks?.forEach((t: any) => { tm[t.id] = t.title; });
    const pm: Record<string, string> = {}; profiles?.forEach((p: any) => { pm[p.id] = p.full_name; });
    setDeleteRequests(requests.map((r: any) => ({ ...r, task_title: tm[r.task_id] || 'Unknown', requester_name: pm[r.requested_by] || 'Unknown' })));
  };

  const fetchLeaveRequests = async () => {
    const { data: requests } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
    if (!requests || requests.length === 0) { setLeaveRequests([]); return; }
    const userIds = [...new Set(requests.map((r: any) => r.user_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    const pm: Record<string, string> = {}; profiles?.forEach((p: any) => { pm[p.id] = p.full_name; });
    setLeaveRequests(requests.map((r: any) => ({ ...r, requester_name: pm[r.user_id] || 'Unknown' })));
  };

  const handleApproveDelete = async (req: any) => {
    if (!user) return; setProcessing(req.id);
    await supabase.from('task_delete_requests').update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    await supabase.from('staff_tasks').delete().eq('id', req.task_id);
    toast({ title: 'Approved', description: `Task "${req.task_title}" deleted.` }); setProcessing(null); fetchDeleteRequests();
  };

  const handleRejectDelete = async (req: any) => {
    if (!user) return; setProcessing(req.id);
    await supabase.from('task_delete_requests').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    toast({ title: 'Rejected' }); setProcessing(null); fetchDeleteRequests();
  };

  const handleApproveLeave = async (req: any) => {
    if (!user) return; setProcessing(req.id);
    await supabase.from('leave_requests').update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    toast({ title: 'Leave Approved' }); setProcessing(null); fetchLeaveRequests();
  };

  const handleRejectLeave = async (req: any) => {
    if (!user) return; setProcessing(req.id);
    await supabase.from('leave_requests').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    toast({ title: 'Leave Rejected' }); setProcessing(null); fetchLeaveRequests();
  };

  const pendingDeletes = deleteRequests.filter((r: any) => r.status === 'pending');
  const reviewedDeletes = deleteRequests.filter((r: any) => r.status !== 'pending');
  const pendingLeaves = leaveRequests.filter((r: any) => r.status === 'pending');
  const reviewedLeaves = leaveRequests.filter((r: any) => r.status !== 'pending');

  const statusBadge = (status: string) => {
    if (status === 'approved') return <Badge className="bg-green-600">Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Requests</h1><p className="text-slate-500">Manage task deletion and leave requests</p></div>
      <Tabs defaultValue="deletions">
        <TabsList>
          <TabsTrigger value="deletions" className="gap-2"><Trash2 className="h-4 w-4" /> Task Deletions{pendingDeletes.length > 0 && <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white ml-1">{pendingDeletes.length}</span>}</TabsTrigger>
          <TabsTrigger value="leave" className="gap-2"><CalendarOff className="h-4 w-4" /> Leave Requests{pendingLeaves.length > 0 && <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white ml-1">{pendingLeaves.length}</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="deletions" className="space-y-4">
          {pendingDeletes.length > 0 ? (
            <Card><CardHeader><CardTitle>Pending</CardTitle></CardHeader><CardContent className="space-y-3">
              {pendingDeletes.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-md border bg-white">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{req.task_title}</p><p className="text-xs text-slate-500">By {req.requester_name} · {format(new Date(req.created_at), 'MMM d, h:mm a')}</p></div>
                  <div className="flex gap-2 ml-3"><Button size="sm" variant="outline" onClick={() => handleApproveDelete(req)} disabled={processing === req.id}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button><Button size="sm" variant="ghost" onClick={() => handleRejectDelete(req)} disabled={processing === req.id}><XCircle className="h-4 w-4 mr-1" />Reject</Button></div>
                </div>
              ))}
            </CardContent></Card>
          ) : <Card><CardContent className="py-8 text-center text-slate-500">No pending deletion requests</CardContent></Card>}
          {reviewedDeletes.length > 0 && (
            <Card><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent className="space-y-2">{reviewedDeletes.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-md border"><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{req.task_title}</p><p className="text-xs text-slate-500">By {req.requester_name}</p></div>{statusBadge(req.status)}</div>
            ))}</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          {pendingLeaves.length > 0 ? (
            <Card><CardHeader><CardTitle>Pending</CardTitle></CardHeader><CardContent className="space-y-3">
              {pendingLeaves.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-md border bg-white">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{req.requester_name}</p><p className="text-xs text-slate-500">{req.leave_type} · {format(new Date(req.start_date), 'MMM d')} – {format(new Date(req.end_date), 'MMM d, yyyy')}</p>{req.reason && <p className="text-xs text-slate-500 mt-1">"{req.reason}"</p>}</div>
                  <div className="flex gap-2 ml-3"><Button size="sm" variant="outline" onClick={() => handleApproveLeave(req)} disabled={processing === req.id}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button><Button size="sm" variant="ghost" onClick={() => handleRejectLeave(req)} disabled={processing === req.id}><XCircle className="h-4 w-4 mr-1" />Reject</Button></div>
                </div>
              ))}
            </CardContent></Card>
          ) : <Card><CardContent className="py-8 text-center text-slate-500">No pending leave requests</CardContent></Card>}
          {reviewedLeaves.length > 0 && (
            <Card><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent className="space-y-2">{reviewedLeaves.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-md border"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{req.requester_name}</p><p className="text-xs text-slate-500">{req.leave_type} · {format(new Date(req.start_date), 'MMM d')} – {format(new Date(req.end_date), 'MMM d')}</p></div>{statusBadge(req.status)}</div>
            ))}</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
