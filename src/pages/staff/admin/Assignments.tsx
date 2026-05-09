import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarClock, Plus, Loader2, Trash2, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AdminAssignments() {
  const { toast } = useToast();
  // ----- Manual recurring (existing) -----
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

  // ----- Roster-based (auto) -----
  const today = new Date();
  const [rosterMonth, setRosterMonth] = useState<number>(today.getMonth() + 1); // 1-indexed
  const [rosterYear, setRosterYear] = useState<number>(today.getFullYear());
  const [rosterAssignments, setRosterAssignments] = useState<any[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // ----- Roster-based fetch + realtime -----
  const fetchRosterAssignments = async () => {
    setIsLoadingRoster(true);
    const monthStart = `${rosterYear}-${String(rosterMonth).padStart(2, '0')}-01`;
    const nextMonth = rosterMonth === 12 ? 1 : rosterMonth + 1;
    const nextYear = rosterMonth === 12 ? rosterYear + 1 : rosterYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const [rRes, pRes, zRes] = await Promise.all([
      supabase.from('roster_zone_assignments')
        .select('*')
        .gte('work_date', monthStart)
        .lt('work_date', monthEnd)
        .order('work_date', { ascending: true }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('geofence_zones').select('id, name'),
    ]);
    const pm: Record<string, string> = {}; pRes.data?.forEach((p: any) => { pm[p.id] = p.full_name; });
    const zm: Record<string, string> = {}; zRes.data?.forEach((z: any) => { zm[z.id] = z.name; });
    const enriched = (rRes.data || []).map((a: any) => ({
      ...a,
      profile_name: pm[a.user_id] || 'Unknown',
      zone_name: zm[a.zone_id] || 'Unknown',
    }));
    setRosterAssignments(enriched);
    setIsLoadingRoster(false);
  };

  useEffect(() => { fetchRosterAssignments(); }, [rosterMonth, rosterYear]);

  // Realtime subscription — auto refresh when roster or assignments change
  useEffect(() => {
    const channel = supabase
      .channel('roster-zone-assignments-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_zone_assignments' }, () => fetchRosterAssignments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_rosters' }, () => fetchRosterAssignments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rosterMonth, rosterYear]);

  const handleResync = async () => {
    setIsSyncing(true);
    const { error } = await supabase.rpc('sync_roster_zone_assignments' as any, { _month: rosterMonth, _year: rosterYear });
    if (error) toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Re-synced from roster' });
    await fetchRosterAssignments();
    setIsSyncing(false);
  };

  // Group roster assignments by staff
  const groupedRoster = useMemo(() => {
    const map: Record<string, { name: string; rows: any[] }> = {};
    for (const a of rosterAssignments) {
      if (!map[a.user_id]) map[a.user_id] = { name: a.profile_name, rows: [] };
      map[a.user_id].rows.push(a);
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterAssignments]);

  // ----- Manual recurring handlers (unchanged) -----
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zone Assignments</h1>
        <p className="text-slate-500">Auto-synced from roster, plus manual recurring overrides</p>
      </div>

      <Tabs defaultValue="roster" className="w-full">
        <TabsList>
          <TabsTrigger value="roster" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Roster-based (auto)</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Manual recurring</TabsTrigger>
        </TabsList>

        {/* ============ ROSTER-BASED (AUTO) ============ */}
        <TabsContent value="roster" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Roster-derived assignments</CardTitle>
                  <CardDescription>Auto-generated from the saved roster. Updates in realtime when roster changes.</CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Month</Label>
                    <Select value={String(rosterMonth)} onValueChange={(v) => setRosterMonth(parseInt(v))}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Select value={String(rosterYear)} onValueChange={(v) => setRosterYear(parseInt(v))}>
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={handleResync} disabled={isSyncing}>
                    {isSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Re-sync from roster
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingRoster ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
              ) : groupedRoster.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No roster-based assignments for {MONTHS[rosterMonth - 1]} {rosterYear}.
                  <br />Save a roster for this month, or click "Re-sync from roster" above.
                </div>
              ) : (
                <div className="space-y-5">
                  {groupedRoster.map((group) => (
                    <div key={group.name}>
                      <p className="text-sm font-semibold text-foreground mb-2">{group.name} <span className="text-xs font-normal text-slate-500">({group.rows.length} shift{group.rows.length === 1 ? '' : 's'})</span></p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-2">
                        {group.rows.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 border rounded-md text-xs">
                            <div>
                              <p className="font-medium">{format(new Date(a.work_date), 'EEE, MMM d')}</p>
                              <p className="text-slate-500">{formatTime(a.start_time)} – {formatTime(a.end_time)}</p>
                              <p className="text-slate-500 truncate">{a.zone_name}</p>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">{a.shift_key}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ MANUAL RECURRING (existing) ============ */}
        <TabsContent value="manual" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-slate-500">Recurring weekly patterns. Used as fallback when no roster shift exists for the day.</p>
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
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Manual Recurring Assignments</CardTitle><CardDescription>{assignments.length} assignment(s)</CardDescription></CardHeader>
            <CardContent>
              {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
              : assignments.length === 0 ? <div className="text-center py-8 text-slate-500">No manual assignments yet.</div>
              : (
                <div className="space-y-2">{assignments.map((a: any, i: number) => {
                  const showHeader = i === 0 || a.profile_name !== assignments[i - 1].profile_name;
                  return (<div key={a.id}>{showHeader && <p className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0">{a.profile_name}</p>}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg ml-2">
                      <div className="space-y-0.5"><p className="text-sm font-medium">{a.zone_name}</p><p className="text-xs text-slate-500">{formatTime(a.start_time)} – {formatTime(a.end_time)} • {formatDays(a.days_of_week)}</p></div>
                      <div className="flex items-center gap-2"><Badge variant={a.is_active ? 'default' : 'secondary'} className="text-xs">{a.is_active ? 'Active' : 'Inactive'}</Badge><Switch checked={a.is_active} onCheckedChange={() => handleToggleActive(a.id, a.is_active)} /><Button variant="ghost" size="icon" onClick={() => handleEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>
                    </div></div>);
                })}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
