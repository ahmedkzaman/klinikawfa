import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Plus, Loader2, Trash2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AdminAssignments() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [aRes, pRes, zRes] = await Promise.all([
      supabase.from('staff_zone_assignments').select('*'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('geofence_zones').select('id, name').eq('is_active', true),
    ]);
    const pm: Record<string, string> = {}; pRes.data?.forEach((p: any) => { pm[p.id] = p.full_name; });
    const zm: Record<string, string> = {}; zRes.data?.forEach((z: any) => { zm[z.id] = z.name; });
    const enriched = (aRes.data || []).map((a: any) => ({ ...a, profile_name: pm[a.user_id] || 'Unknown', zone_name: zm[a.zone_id] || 'Unknown' }));
    enriched.sort((a: any, b: any) => (a.profile_name || '').localeCompare(b.profile_name || ''));
    setAssignments(enriched); setProfiles(pRes.data || []); setZones(zRes.data || []); setIsLoading(false);
  };

  const handleDayToggle = (day: number) => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());

  const handleSave = async () => {
    if (!selectedUserId || !selectedZoneId || selectedDays.length === 0) { toast({ title: 'Missing fields', variant: 'destructive' }); return; }
    setIsSaving(true);
    const payload = { zone_id: selectedZoneId, start_time: startTime, end_time: endTime, days_of_week: selectedDays };
    const { error } = editingId ? await supabase.from('staff_zone_assignments').update(payload).eq('id', editingId) : await supabase.from('staff_zone_assignments').insert({ ...payload, user_id: selectedUserId });
    if (error) toast({ title: 'Error', variant: 'destructive' });
    else { toast({ title: editingId ? 'Updated' : 'Created' }); setIsDialogOpen(false); resetForm(); fetchData(); }
    setIsSaving(false);
  };

  const handleEdit = (a: any) => { setEditingId(a.id); setSelectedUserId(a.user_id); setSelectedZoneId(a.zone_id); setStartTime(a.start_time); setEndTime(a.end_time); setSelectedDays([...a.days_of_week]); setIsDialogOpen(true); };
  const handleToggleActive = async (id: string, isActive: boolean) => { await supabase.from('staff_zone_assignments').update({ is_active: !isActive }).eq('id', id); fetchData(); };
  const handleDelete = async (id: string) => { await supabase.from('staff_zone_assignments').delete().eq('id', id); toast({ title: 'Deleted' }); fetchData(); };
  const resetForm = () => { setEditingId(null); setSelectedUserId(''); setSelectedZoneId(''); setStartTime('09:00'); setEndTime('17:00'); setSelectedDays([1, 2, 3, 4, 5]); };
  const formatDays = (days: number[]) => days.map(d => DAY_LABELS[d]).join(', ');
  const formatTime = (t: string) => { const [h, m] = t.split(':'); const hour = parseInt(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`; };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Zone Assignments</h1><p className="text-muted-foreground">Assign staff to zones with scheduled work hours</p></div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Assignment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'New'} Zone Assignment</DialogTitle><DialogDescription>{editingId ? 'Update the zone, schedule, or working days.' : 'Assign a staff member to a zone.'}</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Employee *</Label><Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={!!editingId}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{profiles.map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Zone *</Label><Select value={selectedZoneId} onValueChange={setSelectedZoneId}><SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger><SelectContent>{zones.map((z: any) => (<SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>))}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Start Time</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div><div className="space-y-2"><Label>End Time</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div></div>
              <div className="space-y-2"><Label>Days of Week *</Label><div className="flex flex-wrap gap-2">{DAY_LABELS.map((label, i) => (<label key={i} className="flex items-center gap-1.5 cursor-pointer"><Checkbox checked={selectedDays.includes(i)} onCheckedChange={() => handleDayToggle(i)} /><span className="text-sm">{label}</span></label>))}</div></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={isSaving}>{isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : editingId ? 'Update' : 'Create'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Current Assignments</CardTitle><CardDescription>{assignments.length} assignment(s)</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : assignments.length === 0 ? <div className="text-center py-8 text-muted-foreground">No assignments yet.</div>
          : (
            <div className="space-y-2">{assignments.map((a: any, i: number) => {
              const showHeader = i === 0 || a.profile_name !== assignments[i - 1].profile_name;
              return (<div key={a.id}>{showHeader && <p className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0">{a.profile_name}</p>}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg ml-2">
                  <div className="space-y-0.5"><p className="text-sm font-medium">{a.zone_name}</p><p className="text-xs text-muted-foreground">{formatTime(a.start_time)} – {formatTime(a.end_time)} • {formatDays(a.days_of_week)}</p></div>
                  <div className="flex items-center gap-2"><Badge variant={a.is_active ? 'default' : 'secondary'} className="text-xs">{a.is_active ? 'Active' : 'Inactive'}</Badge><Switch checked={a.is_active} onCheckedChange={() => handleToggleActive(a.id, a.is_active)} /><Button variant="ghost" size="icon" onClick={() => handleEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                </div></div>);
            })}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
