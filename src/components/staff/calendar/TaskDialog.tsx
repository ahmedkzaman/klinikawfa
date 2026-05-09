import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Trash2, Clock, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { StaffTask, TaskFormData } from '@/hooks/useStaffTasks';

const COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7b61ff', '#e91e63'];

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  task?: StaffTask | null;
  initialDate?: Date;
  profiles: Record<string, string>;
  onSave: (data: TaskFormData) => Promise<{ error: unknown }>;
  onUpdate: (id: string, data: Partial<TaskFormData> & { is_completed?: boolean }) => Promise<{ error: unknown }>;
  onDelete: (id: string) => Promise<{ error: unknown }>;
  onRequestDelete: (taskId: string) => Promise<{ error: unknown }>;
  getPendingDeleteRequest: (taskId: string) => Promise<{ id: string; status: string } | null>;
}

export function TaskDialog({ open, onClose, task, initialDate, profiles, onSave, onUpdate, onDelete, onRequestDelete, getPendingDeleteRequest }: TaskDialogProps) {
  const { user, isAdmin } = useAuth();
  const isEditing = !!task;
  const isOwner = task?.created_by === user?.id;
  const canEdit = !isEditing || isOwner || isAdmin;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState('10:00');
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [color, setColor] = useState(COLORS[0]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPendingDelete, setHasPendingDelete] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      const sd = new Date(task.start_date);
      setStartDate(sd);
      setStartTime(format(sd, 'HH:mm'));
      if (task.end_date) { const ed = new Date(task.end_date); setEndDate(ed); setEndTime(format(ed, 'HH:mm')); }
      else if (task.deadline) { setEndDate(new Date(task.deadline)); setEndTime('10:00'); }
      else { setEndDate(undefined); setEndTime('10:00'); }
      setDeadline(task.deadline ? new Date(task.deadline) : undefined);
      setAssignedTo(task.assigned_to || 'all');
      setColor(task.color);
      setIsCompleted(task.is_completed);
      if (!isAdmin && open) {
        setCheckingDelete(true);
        getPendingDeleteRequest(task.id).then((req) => { setHasPendingDelete(!!req); setCheckingDelete(false); });
      } else { setHasPendingDelete(false); }
    } else {
      setTitle(''); setDescription('');
      setStartDate(initialDate || new Date());
      setStartTime(initialDate ? format(initialDate, 'HH:mm') : '09:00');
      setEndDate(undefined); setEndTime('10:00'); setDeadline(undefined);
      setAssignedTo(''); setColor(COLORS[0]); setIsCompleted(false); setHasPendingDelete(false);
    }
  }, [task, initialDate, open]);

  const buildDate = (date: Date, time: string) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(date); d.setHours(h, m, 0, 0); return d;
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const formData: TaskFormData = {
      title: title.trim(), description: description.trim() || undefined,
      assigned_to: assignedTo === 'all' ? null : (assignedTo || null),
      start_date: buildDate(startDate, startTime),
      end_date: endDate ? buildDate(endDate, endTime) : null,
      deadline: deadline || null, color,
    };
    if (isEditing && task) await onUpdate(task.id, { ...formData, is_completed: isCompleted });
    else await onSave(formData);
    setSaving(false); onClose();
  };

  const handleDelete = async () => {
    if (!task) return;
    setSaving(true);
    if (isAdmin) { await onDelete(task.id); }
    else {
      const { error } = await onRequestDelete(task.id);
      if (!error) toast({ title: 'Deletion request sent', description: 'An admin will review your request.' });
      else toast({ title: 'Error', description: 'Failed to submit deletion request.', variant: 'destructive' });
    }
    setSaving(false); onClose();
  };

  const staffList = Object.entries(profiles).filter(([id]) => id !== user?.id);

  const renderDeleteButton = () => {
    if (!isEditing || !canEdit) return <div />;
    if (isAdmin) return <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>;
    if (checkingDelete) return <Button variant="outline" size="sm" disabled><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Checking...</Button>;
    if (hasPendingDelete) return <Button variant="outline" size="sm" disabled><Clock className="h-4 w-4 mr-1" /> Deletion Pending</Button>;
    return <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}><Trash2 className="h-4 w-4 mr-1" /> Request Deletion</Button>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? 'Edit Task' : 'New Task'}</DialogTitle></DialogHeader>
        {isEditing && task && (
          <p className="text-xs text-slate-500">
            Created by <span className="font-medium">{task.creator_name}</span>
            {task.assignee_name && <> · Assigned to <span className="font-medium">{task.assignee_name}</span></>}
          </p>
        )}
        <div className="space-y-4 mt-2">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" disabled={!canEdit} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" rows={2} disabled={!canEdit} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label>
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn('w-full justify-start text-left font-normal')} disabled={!canEdit}><CalendarIcon className="mr-2 h-4 w-4" />{format(startDate, 'MMM d, yyyy')}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
            </div>
            <div><Label>Start Time</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!canEdit} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>End Date</Label>
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-slate-500')} disabled={!canEdit}><CalendarIcon className="mr-2 h-4 w-4" />{endDate ? format(endDate, 'MMM d, yyyy') : 'Optional'}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
            </div>
            <div><Label>End Time</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={!canEdit} /></div>
          </div>
          <div><Label>Deadline</Label>
            {canEdit ? (
              <Popover><PopoverTrigger asChild><Button variant="outline" className={cn('w-full justify-start text-left font-normal', !deadline && 'text-slate-500')}><CalendarIcon className="mr-2 h-4 w-4" />{deadline ? format(deadline, 'MMM d, yyyy') : 'No deadline'}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={deadline} onSelect={(d) => { setDeadline(d); if (d) { setEndDate(d); } }} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
            ) : (
              <p className="text-sm text-slate-500 mt-1">{deadline ? format(deadline, 'MMM d, yyyy') : 'No deadline'}</p>
            )}
          </div>
          {canEdit && (
            <div><Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Self (unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Self (unassigned)</SelectItem>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffList.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
                </SelectContent>
              </Select></div>
          )}
          <div><Label>Color</Label><div className="flex gap-2 mt-1">{COLORS.map((c) => (<button key={c} onClick={() => canEdit && setColor(c)} className={cn('w-6 h-6 rounded-full border-2 transition-transform', color === c ? 'border-foreground scale-125' : 'border-transparent')} style={{ backgroundColor: c }} disabled={!canEdit} />))}</div></div>
          {isEditing && canEdit && (<div className="flex items-center gap-2"><Checkbox id="completed" checked={isCompleted} onCheckedChange={(c) => setIsCompleted(!!c)} /><Label htmlFor="completed" className="cursor-pointer">Mark as completed</Label></div>)}
          <div className="flex justify-between pt-2">
            {renderDeleteButton()}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              {canEdit && <Button onClick={handleSubmit} disabled={saving || !title.trim()}>{saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}</Button>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
