import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarOff, Plus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency'];

export default function LeaveRequestPage() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaveType, setLeaveType] = useState('Annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    if (!user) return;
    const { data: allRequests } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
    if (!allRequests) return;
    const userIds = [...new Set(allRequests.map((r: any) => r.user_id))];
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    const pm: Record<string, string> = {};
    profs?.forEach((p: any) => { pm[p.id] = p.full_name; });
    const enriched = allRequests.map((r: any) => ({ ...r, requester_name: pm[r.user_id] || 'Unknown' }));
    setMyRequests(enriched.filter((r: any) => r.user_id === user.id));
    setTeamLeaves(enriched.filter((r: any) => r.status === 'approved' && r.user_id !== user.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (endDate < startDate) { toast({ title: 'Invalid dates', description: 'End date must be on or after start date.', variant: 'destructive' }); return; }
    setSubmitting(true);
    const { error } = await supabase.from('leave_requests').insert({ user_id: user.id, leave_type: leaveType, start_date: startDate, end_date: endDate, reason: reason || null });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Request submitted', description: 'Your leave request has been sent for admin approval.' }); setShowForm(false); setLeaveType('Annual'); setStartDate(''); setEndDate(''); setReason(''); fetchData(); }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    if (status === 'approved') return <Badge className="bg-green-600">Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Leave</h1><p className="text-muted-foreground">Request time off and see team availability</p></div>
        <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-2" /> Request Leave</Button>
      </div>
      {showForm && (
        <Card><CardHeader><CardTitle>New Leave Request</CardTitle></CardHeader><CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Leave Type</Label><Select value={leaveType} onValueChange={setLeaveType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
            <div />
            <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Reason (optional)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief explanation..." /></div>
            <div className="sm:col-span-2 flex gap-2"><Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div>
          </form>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" /> My Requests</CardTitle><CardDescription>Your leave request history</CardDescription></CardHeader>
        <CardContent>
          {myRequests.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No leave requests yet</p> : (
            <div className="space-y-2">{myRequests.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-md border">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium capitalize">{req.leave_type} Leave</p><p className="text-xs text-muted-foreground">{format(new Date(req.start_date), 'MMM d')} – {format(new Date(req.end_date), 'MMM d, yyyy')}</p>{req.reason && <p className="text-xs text-muted-foreground mt-0.5">"{req.reason}"</p>}</div>
                {statusBadge(req.status)}
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Team Leaves</CardTitle><CardDescription>Approved leaves from your colleagues</CardDescription></CardHeader>
        <CardContent>
          {teamLeaves.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No upcoming team leaves</p> : (
            <div className="space-y-2">{teamLeaves.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-md border">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{req.requester_name}</p><p className="text-xs text-muted-foreground capitalize">{req.leave_type} · {format(new Date(req.start_date), 'MMM d')} – {format(new Date(req.end_date), 'MMM d')}</p></div>
                <Badge className="bg-green-600">Approved</Badge>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
