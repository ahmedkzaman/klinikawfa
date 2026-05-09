import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserCog } from 'lucide-react';

type Profile = { id: string; full_name: string | null; email: string | null };
type Zone = { id: string; name: string };

export function ManualPunchDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [userId, setUserId] = useState('');
  const [punchType, setPunchType] = useState<'in' | 'out'>('in');
  const [zoneId, setZoneId] = useState('');
  const [punchDate, setPunchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [punchTime, setPunchTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [shiftKey, setShiftKey] = useState<string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [p, z] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').order('full_name'),
        supabase.from('geofence_zones').select('id, name').eq('is_active', true),
      ]);
      setProfiles((p.data ?? []) as Profile[]);
      setZones((z.data ?? []) as Zone[]);
      if (z.data?.[0]) setZoneId(z.data[0].id);
    })();
  }, [open]);

  const reset = () => {
    setUserId(''); setPunchType('in'); setShiftKey(''); setNote('');
    setPunchDate(new Date().toISOString().slice(0, 10));
    setPunchTime(new Date().toTimeString().slice(0, 5));
  };

  const handleSubmit = async () => {
    if (!userId || !zoneId || !punchDate || !punchTime) {
      toast({ title: 'Missing fields', description: 'Staff, zone, date and time are required.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    // Build a Date in local time (admin's browser TZ)
    const punchAt = new Date(`${punchDate}T${punchTime}:00`);
    const { error } = await supabase.from('attendance_records').insert({
      user_id: userId,
      punch_type: punchType,
      punch_time: punchAt.toISOString(),
      latitude: 0,
      longitude: 0,
      accuracy_meters: 0,
      zone_id: zoneId,
      face_verified: false,
      logical_work_date: punchDate,
      shift_key: shiftKey || null,
      admin_note: note || `Manual entry by admin`,
      recorded_by: user?.id ?? null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    const name = profiles.find(p => p.id === userId)?.full_name ?? 'staff';
    toast({ title: 'Manual punch recorded', description: `${name} · ${punchType.toUpperCase()} at ${punchTime}` });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserCog className="h-4 w-4 mr-2" /> Manual Punch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Manual Punch</DialogTitle>
          <DialogDescription>
            Use this to record an attendance punch on behalf of a staff member when the
            normal punch flow is unavailable. The entry is marked as admin-recorded
            (no face verification) and stamped with your user id for audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Staff</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
              <SelectContent className="max-h-72">
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Punch Type</Label>
              <Select value={punchType} onValueChange={(v) => setPunchType(v as 'in' | 'out')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">In</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Zone</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={punchDate} onChange={e => setPunchDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Time</Label>
              <Input type="time" value={punchTime} onChange={e => setPunchTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Shift (optional)</Label>
            <Select value={shiftKey || '__none__'} onValueChange={(v) => setShiftKey(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Auto-detect from roster" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Auto-detect</SelectItem>
                <SelectItem value="S1">S1 (Shift 1)</SelectItem>
                <SelectItem value="S2">S2 (Shift 2)</SelectItem>
                <SelectItem value="S3">S3 (Shift 3)</SelectItem>
                <SelectItem value="DOC_S1">DOC_S1</SelectItem>
                <SelectItem value="DOC_S2">DOC_S2</SelectItem>
                <SelectItem value="DOC_S3">DOC_S3</SelectItem>
                <SelectItem value="Daytime">Daytime</SelectItem>
                <SelectItem value="Hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reason / Note</Label>
            <Textarea
              rows={2}
              placeholder="e.g. Punch-in window had closed at 16:10 — staff reports phone clock issue."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Punch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
