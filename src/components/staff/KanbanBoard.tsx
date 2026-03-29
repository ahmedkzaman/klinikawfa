import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Plus, Eye, EyeOff, Trash2, User, Users, GripVertical, CalendarIcon, AlertTriangle } from 'lucide-react';
import { useStaffTasks, type StaffTask } from '@/hooks/useStaffTasks';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'bg-blue-500' },
  { id: 'not_done', title: 'Not Done Yet', color: 'bg-orange-500' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-yellow-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
] as const;

type ColumnId = typeof COLUMNS[number]['id'];

export default function KanbanBoard() {
  const { user, isAdmin } = useAuth();
  const { tasks, profiles, createTask, updateTask, deleteTask, requestDelete } = useStaffTasks();
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssignee, setNewAssignee] = useState<string>('all');
  const [newColumn, setNewColumn] = useState<ColumnId>('todo');
  const [newDeadline, setNewDeadline] = useState<Date | undefined>();
  const [newAdminOnly, setNewAdminOnly] = useState(false);

  const profileList = useMemo(() => Object.entries(profiles).map(([id, name]) => ({ id, name })), [profiles]);

  const grouped = useMemo(() => {
    const map: Record<ColumnId, StaffTask[]> = { todo: [], not_done: [], in_progress: [], done: [] };
    tasks.forEach((t) => {
      const col = (t.board_column as ColumnId) || 'todo';
      if (map[col]) map[col].push(t);
      else map.todo.push(t);
    });
    return map;
  }, [tasks]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newCol = result.destination.droppableId as ColumnId;
    const { error } = await updateTask(taskId, {
      board_column: newCol,
      is_completed: newCol === 'done',
      last_edited_by: user?.id,
    });
    if (error) toast.error('Failed to move task');
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const { error } = await createTask({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      assigned_to: newAssignee === 'all' ? null : newAssignee,
      start_date: new Date(),
      deadline: newDeadline || null,
      color: '#3b82f6',
      board_column: newColumn,
      visibility: newAdminOnly ? 'admin_only' : 'all',
    });
    if (error) { toast.error('Failed to create task'); return; }
    toast.success('Task created');
    setNewTitle(''); setNewDesc(''); setNewAssignee('all'); setNewColumn('todo'); setNewDeadline(undefined); setNewAdminOnly(false); setAddOpen(false);
  };

  const handleDelete = async (task: StaffTask) => {
    if (isAdmin) {
      const { error } = await deleteTask(task.id);
      if (error) toast.error('Failed to delete'); else toast.success('Task deleted');
    } else {
      const { error } = await requestDelete(task.id);
      if (error) toast.error('Failed to request deletion'); else toast.success('Delete request submitted');
    }
  };

  const handleVisibilityToggle = async (task: StaffTask) => {
    const newVis = task.visibility === 'admin_only' ? 'all' : 'admin_only';
    const { error } = await updateTask(task.id, { visibility: newVis, last_edited_by: user?.id });
    if (error) toast.error('Failed to update visibility');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Task Board</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title" /></div>
              <div><Label>Description</Label><Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional description" rows={3} /></div>
              <div><Label>Assign to</Label>
                <Select value={newAssignee} onValueChange={setNewAssignee}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {profileList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Column</Label>
                <Select value={newColumn} onValueChange={(v) => setNewColumn(v as ColumnId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Deadline</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !newDeadline && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newDeadline ? format(newDeadline, 'MMM d, yyyy') : 'No deadline'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {newDeadline && <Button variant="ghost" size="sm" className="mt-1 text-xs h-6" onClick={() => setNewDeadline(undefined)}>Clear deadline</Button>}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Switch checked={newAdminOnly} onCheckedChange={setNewAdminOnly} id="admin-only" />
                  <Label htmlFor="admin-only">Admin only</Label>
                </div>
              )}
            </div>
            <DialogFooter><Button onClick={handleAdd} disabled={!newTitle.trim()}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {COLUMNS.map((col) => (
              <div key={col.id} className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold">{col.title}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">{grouped[col.id].length}</Badge>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 min-h-[120px] rounded-lg border border-dashed p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-accent/50 border-primary' : 'border-border bg-muted/30'}`}
                    >
                      {grouped[col.id].map((task, idx) => (
                        <Draggable key={task.id} draggableId={task.id} index={idx}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`rounded-md border bg-card p-3 shadow-sm text-sm ${snap.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''} ${task.visibility === 'admin_only' ? 'border-l-4 border-l-amber-400' : ''}`}
                            >
                              <div className="flex items-start gap-1">
                                <div {...prov.dragHandleProps} className="mt-0.5 cursor-grab"><GripVertical className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{task.title}</p>
                                  {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                                    {task.assigned_to ? (
                                      <Badge variant="outline" className="text-[10px] gap-1"><User className="h-2.5 w-2.5" />{task.assignee_name}</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] gap-1"><Users className="h-2.5 w-2.5" />All Staff</Badge>
                                    )}
                                    {task.visibility === 'admin_only' && <Badge variant="secondary" className="text-[10px]">Admin Only</Badge>}
                                  </div>
                                  {isAdmin && (
                                    <div className="text-[10px] text-muted-foreground mt-1.5 space-y-0.5">
                                      <p>Created by: {task.creator_name}</p>
                                      {task.last_edited_by && profiles[task.last_edited_by] && <p>Edited by: {profiles[task.last_edited_by]}</p>}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  {isAdmin && (
                                    <button onClick={() => handleVisibilityToggle(task)} className="p-1 rounded hover:bg-accent" title={task.visibility === 'admin_only' ? 'Make visible to all' : 'Make admin only'}>
                                      {task.visibility === 'admin_only' ? <EyeOff className="h-3.5 w-3.5 text-amber-500" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(task)} className="p-1 rounded hover:bg-destructive/10" title={isAdmin ? 'Delete' : 'Request deletion'}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </CardContent>
    </Card>
  );
}
