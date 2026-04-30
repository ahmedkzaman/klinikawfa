import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Clock, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

type Row = {
  id: string;
  scope: 'global' | 'role';
  role: AppRole | null;
  clock_in_early_min: number;
  clock_in_late_min: number;
  clock_out_early_min: number;
  clock_out_late_min: number;
};

const ROLE_OPTIONS: AppRole[] = ['admin', 'staff', 'special_admin', 'doctor_admin', 'operations', 'locum'];

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  guest: 'Guest',
  special_admin: 'Special Admin',
  doctor_admin: 'Doctor Admin',
  operations: 'Operations',
  locum: 'Locum',
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function previewRange(startMin: number, endMin: number, early: number, late: number) {
  const fmt = (m: number) => {
    const total = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const mm = total % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad(mm)} ${ampm}`;
  };
  return `${fmt(startMin - early)} – ${fmt(endMin + late)}`;
}

export default function PunchSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRole, setNewRole] = useState<AppRole | ''>('');
  const [newValues, setNewValues] = useState({
    clock_in_early_min: 60, clock_in_late_min: 60,
    clock_out_early_min: 30, clock_out_late_min: 120,
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('punch_buffer_settings').select('*').order('scope').order('role');
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateRow = async (id: string, patch: Partial<Row>) => {
    setSaving(id);
    const { error } = await supabase
      .from('punch_buffer_settings')
      .update({ ...patch, updated_by: user?.id })
      .eq('id', id);
    setSaving(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Punch buffer updated.' });
      load();
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Remove this role override? Affected staff will fall back to the global default.')) return;
    const { error } = await supabase.from('punch_buffer_settings').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Removed' });
      load();
    }
  };

  const addOverride = async () => {
    if (!newRole) return;
    const { error } = await supabase.from('punch_buffer_settings').insert({
      scope: 'role', role: newRole, ...newValues, updated_by: user?.id,
    });
    if (error) {
      toast({ title: 'Add failed', description: error.message, variant: 'destructive' });
      return;
    }
    setAddOpen(false);
    setNewRole('');
    setNewValues({ clock_in_early_min: 60, clock_in_late_min: 60, clock_out_early_min: 30, clock_out_late_min: 120 });
    load();
  };

  const globalRow = rows.find(r => r.scope === 'global');
  const roleRows = rows.filter(r => r.scope === 'role');
  const usedRoles = new Set(roleRows.map(r => r.role));
  const availableRoles = ROLE_OPTIONS.filter(r => !usedRoles.has(r));

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-2 sm:p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Clock className="h-6 w-6" /> Punch Buffer Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure how early or late staff can clock in or out around their rostered shift.
          Per-role overrides take precedence over the global default.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Lateness is still recorded by the attendance system — these buffers only control whether a staff member is <strong>allowed</strong> to record a punch.
          Clocking in late within the buffer will still be flagged in the Attendance Review.
        </AlertDescription>
      </Alert>

      {/* Global */}
      {globalRow && (
        <BufferCard
          title="Global Default"
          description="Applies to all staff unless overridden by role below."
          row={globalRow}
          saving={saving === globalRow.id}
          onSave={(patch) => updateRow(globalRow.id, patch)}
        />
      )}

      {/* Per-role overrides */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Per-Role Overrides</CardTitle>
            <CardDescription>Different roles may need different punch windows (e.g. doctors need longer clock-out for late finishes).</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={availableRoles.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Add Override
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {roleRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No role overrides yet. All staff use the global default above.</p>
          )}
          {roleRows.map(row => (
            <BufferCard
              key={row.id}
              title={`Role: ${ROLE_LABEL[row.role!]}`}
              description={`Overrides global default for users with the ${ROLE_LABEL[row.role!]} role.`}
              row={row}
              saving={saving === row.id}
              onSave={(patch) => updateRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
              compact
            />
          ))}
        </CardContent>
      </Card>

      {/* Add override dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Role Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <BufferFieldGrid values={newValues} onChange={setNewValues} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addOverride} disabled={!newRole}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- helpers ----------

function BufferCard({
  title, description, row, saving, onSave, onDelete, compact,
}: {
  title: string; description: string; row: Row; saving: boolean;
  onSave: (patch: Partial<Row>) => void; onDelete?: () => void; compact?: boolean;
}) {
  const [values, setValues] = useState({
    clock_in_early_min: row.clock_in_early_min,
    clock_in_late_min: row.clock_in_late_min,
    clock_out_early_min: row.clock_out_early_min,
    clock_out_late_min: row.clock_out_late_min,
  });
  useEffect(() => {
    setValues({
      clock_in_early_min: row.clock_in_early_min,
      clock_in_late_min: row.clock_in_late_min,
      clock_out_early_min: row.clock_out_early_min,
      clock_out_late_min: row.clock_out_late_min,
    });
  }, [row.id]);

  const dirty =
    values.clock_in_early_min !== row.clock_in_early_min ||
    values.clock_in_late_min !== row.clock_in_late_min ||
    values.clock_out_early_min !== row.clock_out_early_min ||
    values.clock_out_late_min !== row.clock_out_late_min;

  // Preview using example shift 8:00 (480 min) → 16:00 (960 min)
  const preview = previewRange(480, 960, values.clock_in_early_min, values.clock_out_late_min);

  return (
    <Card className={compact ? 'border-muted' : ''}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onDelete && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <BufferFieldGrid values={values} onChange={setValues} />
        <div className="rounded-md bg-muted/50 p-3 text-xs">
          <div className="font-medium text-muted-foreground mb-1">Preview (for an 8:00 AM – 4:00 PM shift):</div>
          <div>Punch window: <Badge variant="secondary">{preview}</Badge></div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => onSave(values)} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BufferFieldGrid({
  values, onChange,
}: {
  values: { clock_in_early_min: number; clock_in_late_min: number; clock_out_early_min: number; clock_out_late_min: number };
  onChange: (v: typeof values) => void;
}) {
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Math.max(0, Math.min(480, Number(e.target.value) || 0));
    onChange({ ...values, [k]: n });
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Clock-in: minutes BEFORE shift start" value={values.clock_in_early_min} onChange={set('clock_in_early_min')} hint="How early can staff punch in?" />
      <Field label="Clock-in: minutes AFTER shift start" value={values.clock_in_late_min} onChange={set('clock_in_late_min')} hint="Lateness grace window" />
      <Field label="Clock-out: minutes BEFORE shift end" value={values.clock_out_early_min} onChange={set('clock_out_early_min')} hint="Allow finishing slightly early" />
      <Field label="Clock-out: minutes AFTER shift end" value={values.clock_out_late_min} onChange={set('clock_out_late_min')} hint="Covers overtime / late finish" />
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hint: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} max={480} value={value} onChange={onChange} />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
