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
type Scope = 'global' | 'role' | 'shift' | 'role_shift';
type ShiftKey = 'S1' | 'S2' | 'S3' | 'Hybrid' | 'Night';

type Row = {
  id: string;
  scope: Scope;
  role: AppRole | null;
  shift_key: ShiftKey | null;
  clock_in_early_min: number;
  clock_in_late_min: number;
  clock_out_early_min: number;
  clock_out_late_min: number;
};

const ROLE_OPTIONS: AppRole[] = ['admin', 'staff', 'special_admin', 'doctor_admin', 'operations', 'locum'];
const SHIFT_OPTIONS: ShiftKey[] = ['S1', 'S2', 'S3', 'Hybrid', 'Night'];

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  guest: 'Guest',
  special_admin: 'Special Admin',
  doctor_admin: 'Doctor Admin',
  operations: 'Operations',
  locum: 'Locum',
};

const SHIFT_LABEL: Record<ShiftKey, string> = {
  S1: 'S1 — AM (08:00–16:00)',
  S2: 'S2 — PM (16:00–24:00)',
  S3: 'S3 — Evening (20:00–24:00)',
  Hybrid: 'Hybrid (08:00–13:00)',
  Night: 'Night (20:00–24:00)',
};

const SHIFT_RANGE: Record<ShiftKey, [number, number]> = {
  S1: [480, 960],
  S2: [960, 1440],
  S3: [1200, 1440],
  Hybrid: [480, 780],
  Night: [1200, 1440],
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
  const [addOpen, setAddOpen] = useState<null | 'role' | 'shift' | 'role_shift'>(null);
  const [newRole, setNewRole] = useState<AppRole | ''>('');
  const [newShift, setNewShift] = useState<ShiftKey | ''>('');
  const [newValues, setNewValues] = useState({
    clock_in_early_min: 60, clock_in_late_min: 60,
    clock_out_early_min: 30, clock_out_late_min: 120,
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('punch_buffer_settings')
      .select('*')
      .order('scope').order('role').order('shift_key');
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
    if (!confirm('Remove this override? Affected punches will fall back to a less-specific rule.')) return;
    const { error } = await supabase.from('punch_buffer_settings').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Removed' });
      load();
    }
  };

  const addOverride = async () => {
    if (!addOpen) return;
    const payload: any = { scope: addOpen, ...newValues, updated_by: user?.id };
    if (addOpen === 'role' || addOpen === 'role_shift') {
      if (!newRole) return;
      payload.role = newRole;
    }
    if (addOpen === 'shift' || addOpen === 'role_shift') {
      if (!newShift) return;
      payload.shift_key = newShift;
    }
    const { error } = await supabase.from('punch_buffer_settings').insert(payload);
    if (error) {
      toast({ title: 'Add failed', description: error.message, variant: 'destructive' });
      return;
    }
    setAddOpen(null);
    setNewRole('');
    setNewShift('');
    setNewValues({ clock_in_early_min: 60, clock_in_late_min: 60, clock_out_early_min: 30, clock_out_late_min: 120 });
    load();
  };

  const globalRow = rows.find(r => r.scope === 'global');
  const roleRows = rows.filter(r => r.scope === 'role');
  const shiftRows = rows.filter(r => r.scope === 'shift');
  const roleShiftRows = rows.filter(r => r.scope === 'role_shift');

  const usedRoles = new Set(roleRows.map(r => r.role));
  const availableRoles = ROLE_OPTIONS.filter(r => !usedRoles.has(r));
  const usedShifts = new Set(shiftRows.map(r => r.shift_key));
  const availableShifts = SHIFT_OPTIONS.filter(s => !usedShifts.has(s));

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
          Resolution order: <strong>Role + Shift</strong> → <strong>Shift</strong> → <strong>Role</strong> → <strong>Global</strong>.
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
          description="Applies when no more specific override matches."
          row={globalRow}
          saving={saving === globalRow.id}
          onSave={(patch) => updateRow(globalRow.id, patch)}
        />
      )}

      {/* Per-shift */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Per-Shift Overrides</CardTitle>
            <CardDescription>
              Different windows for AM vs PM vs Night shifts. PM closers often need a longer late-finish buffer for cash-up and dispensary close-down.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen('shift')} disabled={availableShifts.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Add Shift
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {shiftRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No shift overrides yet.</p>
          )}
          {shiftRows.map(row => (
            <BufferCard
              key={row.id}
              title={`Shift: ${SHIFT_LABEL[row.shift_key!]}`}
              description={`Applies to all staff working the ${row.shift_key} shift.`}
              row={row}
              shiftKey={row.shift_key!}
              saving={saving === row.id}
              onSave={(patch) => updateRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
              compact
            />
          ))}
        </CardContent>
      </Card>

      {/* Per-role */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Per-Role Overrides</CardTitle>
            <CardDescription>Role-wide windows (e.g. doctors need longer clock-out for late finishes).</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen('role')} disabled={availableRoles.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Add Role
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {roleRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No role overrides yet.</p>
          )}
          {roleRows.map(row => (
            <BufferCard
              key={row.id}
              title={`Role: ${ROLE_LABEL[row.role!]}`}
              description={`Overrides the global default for users with the ${ROLE_LABEL[row.role!]} role.`}
              row={row}
              saving={saving === row.id}
              onSave={(patch) => updateRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
              compact
            />
          ))}
        </CardContent>
      </Card>

      {/* Role + Shift */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Role + Shift Overrides</CardTitle>
            <CardDescription>Most specific rule. Use sparingly — e.g. "Locums on PM shift get a 4-hour late-finish buffer".</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen('role_shift')}>
            <Plus className="h-4 w-4 mr-1" /> Add Role + Shift
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {roleShiftRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No role+shift overrides yet.</p>
          )}
          {roleShiftRows.map(row => (
            <BufferCard
              key={row.id}
              title={`${ROLE_LABEL[row.role!]} on ${row.shift_key}`}
              description={`Highest-priority rule — applies to ${ROLE_LABEL[row.role!]} working ${SHIFT_LABEL[row.shift_key!]}.`}
              row={row}
              shiftKey={row.shift_key!}
              saving={saving === row.id}
              onSave={(patch) => updateRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
              compact
            />
          ))}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen !== null} onOpenChange={(v) => { if (!v) setAddOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addOpen === 'role' && 'Add Role Override'}
              {addOpen === 'shift' && 'Add Shift Override'}
              {addOpen === 'role_shift' && 'Add Role + Shift Override'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(addOpen === 'role' || addOpen === 'role_shift') && (
              <div>
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                  <SelectContent>
                    {(addOpen === 'role' ? availableRoles : ROLE_OPTIONS).map(r =>
                      <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(addOpen === 'shift' || addOpen === 'role_shift') && (
              <div>
                <Label>Shift</Label>
                <Select value={newShift} onValueChange={(v) => setNewShift(v as ShiftKey)}>
                  <SelectTrigger><SelectValue placeholder="Select a shift" /></SelectTrigger>
                  <SelectContent>
                    {(addOpen === 'shift' ? availableShifts : SHIFT_OPTIONS).map(s =>
                      <SelectItem key={s} value={s}>{SHIFT_LABEL[s]}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <BufferFieldGrid values={newValues} onChange={setNewValues} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(null)}>Cancel</Button>
            <Button
              onClick={addOverride}
              disabled={
                (addOpen === 'role' && !newRole) ||
                (addOpen === 'shift' && !newShift) ||
                (addOpen === 'role_shift' && (!newRole || !newShift))
              }
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- helpers ----------

function BufferCard({
  title, description, row, saving, onSave, onDelete, compact, shiftKey,
}: {
  title: string; description: string; row: Row; saving: boolean;
  onSave: (patch: Partial<Row>) => void; onDelete?: () => void; compact?: boolean;
  shiftKey?: ShiftKey;
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

  // Preview against this rule's specific shift, or both AM + PM as a sanity check.
  const previews: { label: string; range: string }[] = shiftKey
    ? [{
        label: SHIFT_LABEL[shiftKey],
        range: previewRange(SHIFT_RANGE[shiftKey][0], SHIFT_RANGE[shiftKey][1], values.clock_in_early_min, values.clock_out_late_min),
      }]
    : [
        { label: 'AM (08:00–16:00)', range: previewRange(480, 960, values.clock_in_early_min, values.clock_out_late_min) },
        { label: 'PM (16:00–24:00)', range: previewRange(960, 1440, values.clock_in_early_min, values.clock_out_late_min) },
      ];

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
        <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
          <div className="font-medium text-muted-foreground">Preview punch window:</div>
          {previews.map(p => (
            <div key={p.label} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{p.label}:</span>
              <Badge variant="secondary">{p.range}</Badge>
            </div>
          ))}
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
      <Field
        label="Clock-in: minutes AFTER shift start"
        value={values.clock_in_late_min}
        onChange={set('clock_in_late_min')}
        hint="Lateness grace window"
        tip="Tip: Clinical staff often arrive late due to prior consults. We recommend ≥180 mins for doctors and evening shifts."
      />
      <Field label="Clock-out: minutes BEFORE shift end" value={values.clock_out_early_min} onChange={set('clock_out_early_min')} hint="Allow finishing slightly early" />
      <Field label="Clock-out: minutes AFTER shift end" value={values.clock_out_late_min} onChange={set('clock_out_late_min')} hint="Covers overtime / late finish" />
    </div>
  );
}

function Field({ label, value, onChange, hint, tip }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hint: string; tip?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} max={480} value={value} onChange={onChange} />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      {tip && <p className="text-[11px] text-primary/80 italic">{tip}</p>}
    </div>
  );
}
