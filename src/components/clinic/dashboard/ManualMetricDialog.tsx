import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MANAGEMENT_METRIC_DEFINITIONS, type DashboardManualMetric, type DashboardManualMetricInput, type ManagementMetricKey, type ManualMetricStatus } from '@/lib/clinic/managementDashboard';

export function ManualMetricDialog({
  open, onOpenChange, monthStart, metricKey, value, onSave, onDelete, pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthStart: string;
  metricKey: ManagementMetricKey | null;
  value?: DashboardManualMetric;
  onSave: (input: DashboardManualMetricInput) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState('');
  const [actual, setActual] = useState('');
  const [status, setStatus] = useState<ManualMetricStatus | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setTarget(value?.target_numeric?.toString() ?? '');
    setActual(value?.actual_numeric?.toString() ?? '');
    setStatus(value?.status ?? '');
    setNotes(value?.notes ?? '');
  }, [value, metricKey, open]);

  if (!metricKey) return null;
  const definition = MANAGEMENT_METRIC_DEFINITIONS[metricKey];
  const numeric = ['currency', 'number', 'rating', 'checkbox'].includes(definition.kind);
  const invalid = numeric && actual !== '' && (
    Number.isNaN(Number(actual)) ||
    (definition.min !== undefined && Number(actual) < definition.min) ||
    (definition.max !== undefined && Number(actual) > definition.max)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{definition.label}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {numeric && (
            <div className="space-y-1.5">
              <Label>Actual value</Label>
              <Input type="number" min={definition.min} max={definition.max} value={actual} onChange={(e) => setActual(e.target.value)} />
              {invalid && <p className="text-xs text-red-600">Enter a value within the allowed range.</p>}
            </div>
          )}
          {numeric && definition.kind !== 'checkbox' && (
            <div className="space-y-1.5">
              <Label>Target</Label>
              <Input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          )}
          {(definition.kind === 'status' || definition.kind === 'text') && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status || 'not_started'} onValueChange={(next) => setStatus(next as ManualMetricStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {value ? <Button variant="destructive" onClick={onDelete} disabled={pending}>Delete</Button> : <span />}
          <Button disabled={pending || invalid} onClick={() => onSave({
            monthStart,
            metricKey,
            targetNumeric: target === '' ? null : Number(target),
            actualNumeric: actual === '' ? null : Number(actual),
            status: status || null,
            notes,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
