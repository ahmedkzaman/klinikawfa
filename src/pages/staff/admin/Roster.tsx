import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Trash2, RefreshCw, Download, Printer, AlertTriangle, X, Users, Settings2, Shuffle, Stethoscope, UserCog
} from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface StaffMember {
  id: string;
  name: string;
  position: string;
}

interface RosterCell {
  staffId: string | null;
  staffName: string;
}

interface RosterData {
  [day: string]: { shift1: RosterCell[]; shift2: RosterCell[] };
}

interface StaffSummary {
  name: string;
  totalShifts: number;
  totalHours: number;
  isOvertime: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SHIFT_HOURS = 8;

const DOCTOR_POSITIONS = ['Doctor'];
const SUPPORT_POSITIONS = ['Clinic Assistant', 'Staff Nurse', 'Medical Assistant'];

// ─── Reusable Roster Panel ───────────────────────────────────────────

function RosterPanel({ initialStaff, title, rosterType }: { initialStaff: StaffMember[]; title: string; rosterType: string }) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPosition, setNewStaffPosition] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState('');

  const [maxHoursEnabled, setMaxHoursEnabled] = useState(true);
  const [fixedShiftEnabled, setFixedShiftEnabled] = useState(true);
  const [weekdayConstraintEnabled, setWeekdayConstraintEnabled] = useState(false);
  const [constrainedStaffIds, setConstrainedStaffIds] = useState<string[]>([]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });

  const [roster, setRoster] = useState<RosterData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [staffPerShift, setStaffPerShift] = useState(2);

  // Sync when initialStaff changes
  useEffect(() => { setStaffList(initialStaff); }, [initialStaff]);

  const addStaff = () => {
    if (!newStaffName.trim()) return;
    setStaffList(prev => [...prev, { id: crypto.randomUUID(), name: newStaffName.trim(), position: newStaffPosition.trim() }]);
    setNewStaffName('');
    setNewStaffPosition('');
  };

  const removeStaff = (id: string) => {
    setStaffList(prev => prev.filter(s => s.id !== id));
    setConstrainedStaffIds(prev => prev.filter(sid => sid !== id));
  };

  const startEdit = (s: StaffMember) => { setEditingId(s.id); setEditName(s.name); setEditPosition(s.position); };

  const saveEdit = () => {
    if (!editingId) return;
    setStaffList(prev => prev.map(s => s.id === editingId ? { ...s, name: editName.trim() || s.name, position: editPosition.trim() } : s));
    setEditingId(null);
  };

  const toggleConstrained = (id: string) => {
    setConstrainedStaffIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const generateRoster = () => {
    if (staffList.length === 0) { toast.error('Add at least one staff member first'); return; }

    const newRoster: RosterData = {};
    const staffHours: Record<string, number> = {};
    const staffShifts: Record<string, number> = {};
    const newWarnings: string[] = [];

    staffList.forEach(s => { staffHours[s.id] = 0; staffShifts[s.id] = 0; });

    for (const day of DAYS) {
      const isWeekday = WEEKDAYS.includes(day);
      const assignedToday = new Set<string>();

      const pickStaff = (shiftNum: 1 | 2): RosterCell[] => {
        const cells: RosterCell[] = [];
        for (let i = 0; i < staffPerShift; i++) {
          let eligible = staffList.filter(s => !assignedToday.has(s.id));
          if (weekdayConstraintEnabled && isWeekday && shiftNum === 2) {
            eligible = eligible.filter(s => !constrainedStaffIds.includes(s.id));
          }
          if (maxHoursEnabled) {
            eligible = eligible.filter(s => staffHours[s.id] + SHIFT_HOURS <= 48);
          }
          if (eligible.length === 0) {
            cells.push({ staffId: null, staffName: 'Unassigned' });
            newWarnings.push(`${day} Shift ${shiftNum}: Not enough eligible staff (slot ${i + 1})`);
            continue;
          }
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          assignedToday.add(pick.id);
          staffHours[pick.id] += SHIFT_HOURS;
          staffShifts[pick.id] += 1;
          cells.push({ staffId: pick.id, staffName: pick.name });
        }
        return cells;
      };

      newRoster[day] = { shift1: pickStaff(1), shift2: pickStaff(2) };
    }

    if (maxHoursEnabled) {
      staffList.forEach(s => {
        if (staffHours[s.id] < 45) {
          newWarnings.push(`${s.name}: Only ${staffHours[s.id]}h assigned (below 45h minimum)`);
        } else if (staffHours[s.id] > 48) {
          newWarnings.push(`${s.name}: ${staffHours[s.id]}h assigned (exceeds 48h maximum)`);
        }
      });
    }
    }

    setRoster(newRoster);
    setWarnings(newWarnings);
    if (newWarnings.length === 0) toast.success('Roster generated successfully!');
    else toast.warning(`Roster generated with ${newWarnings.length} warning(s)`);
  };

  const clearRoster = () => { setRoster(null); setWarnings([]); };

  const getSummary = (): StaffSummary[] => {
    if (!roster) return [];
    const hours: Record<string, number> = {};
    const shifts: Record<string, number> = {};
    staffList.forEach(s => { hours[s.id] = 0; shifts[s.id] = 0; });
    for (const day of DAYS) {
      const r = roster[day];
      [...r.shift1, ...r.shift2].forEach(cell => {
        if (cell.staffId) {
          hours[cell.staffId] = (hours[cell.staffId] || 0) + SHIFT_HOURS;
          shifts[cell.staffId] = (shifts[cell.staffId] || 0) + 1;
        }
      });
    }
    return staffList.map(s => ({
      name: s.name,
      totalShifts: shifts[s.id] || 0,
      totalHours: hours[s.id] || 0,
      isOvertime: (hours[s.id] || 0) > 45,
    }));
  };

  const exportCSV = () => {
    if (!roster) return;
    const rows: string[] = [];
    rows.push(`${title} — Week of ${format(weekStart, 'dd MMM yyyy')}`);
    rows.push(['Shift', ...DAYS].join(','));
    const shift1Row = ['Shift 1 (8am-4pm)'];
    const shift2Row = ['Shift 2 (4pm-12am)'];
    for (const day of DAYS) {
      shift1Row.push(roster[day].shift1.map(c => c.staffName).join(' / '));
      shift2Row.push(roster[day].shift2.map(c => c.staffName).join(' / '));
    }
    rows.push(shift1Row.join(','));
    rows.push(shift2Row.join(','));
    rows.push('');
    rows.push('Staff,Total Shifts,Total Hours,Overtime');
    getSummary().forEach(s => {
      rows.push(`${s.name},${s.totalShifts},${s.totalHours},${s.isOvertime ? s.totalHours - 45 + 'h' : '-'}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-${rosterType}-${format(weekStart, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const summary = getSummary();

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Staff List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Staff List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="flex-1" />
              <Input placeholder="Position" value={newStaffPosition} onChange={e => setNewStaffPosition(e.target.value)} className="flex-1" />
              <Button size="icon" onClick={addStaff}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {staffList.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
                  {editingId === s.id ? (
                    <>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs flex-1" />
                      <Input value={editPosition} onChange={e => setEditPosition(e.target.value)} className="h-7 text-xs flex-1" />
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={saveEdit}>Save</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium cursor-pointer" onClick={() => startEdit(s)}>{s.name}</span>
                      {s.position && <Badge variant="secondary" className="text-xs">{s.position}</Badge>}
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeStaff(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {staffList.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No staff found for this roster type.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Rules & Constraints */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox id={`maxHours-${rosterType}`} checked={maxHoursEnabled} onCheckedChange={(v) => setMaxHoursEnabled(!!v)} />
                <div>
                  <Label htmlFor={`maxHours-${rosterType}`} className="text-sm font-medium">Maximum 45 working hours per week</Label>
                  <p className="text-xs text-muted-foreground">Hours beyond 45 will be flagged as overtime in the summary</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id={`fixedShift-${rosterType}`} checked={fixedShiftEnabled} onCheckedChange={(v) => setFixedShiftEnabled(!!v)} />
                <div>
                  <Label htmlFor={`fixedShift-${rosterType}`} className="text-sm font-medium">Fixed shift hours</Label>
                  <p className="text-xs text-muted-foreground">Shift 1: 8:00 AM – 4:00 PM · Shift 2: 4:00 PM – 12:00 AM</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id={`weekdayConstraint-${rosterType}`} checked={weekdayConstraintEnabled} onCheckedChange={(v) => setWeekdayConstraintEnabled(!!v)} />
                <div>
                  <Label htmlFor={`weekdayConstraint-${rosterType}`} className="text-sm font-medium">Weekday Shift 1 restriction</Label>
                  <p className="text-xs text-muted-foreground">Selected staff can only work Shift 1 on weekdays, but can be assigned Shift 2 on weekends</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t">
                <Label className="text-sm font-medium whitespace-nowrap">Staff per shift:</Label>
                <Select value={String(staffPerShift)} onValueChange={v => setStaffPerShift(Number(v))}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {weekdayConstraintEnabled && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Weekday Shift 1 Only Staff</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Select staff who can only work Shift 1 on weekdays (Mon–Fri). They can still be assigned Shift 2 on weekends.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {staffList.map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <Checkbox id={`constrain-${rosterType}-${s.id}`} checked={constrainedStaffIds.includes(s.id)} onCheckedChange={() => toggleConstrained(s.id)} />
                      <Label htmlFor={`constrain-${rosterType}-${s.id}`} className="text-sm">{s.name}</Label>
                      {s.position && <Badge variant="outline" className="text-xs">{s.position}</Badge>}
                    </div>
                  ))}
                  {staffList.length === 0 && <p className="text-xs text-muted-foreground">Add staff first</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Generated Roster */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2"><Shuffle className="h-5 w-5" /> {title}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Week of {format(weekStart, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Button onClick={generateRoster} className="gap-2"><Shuffle className="h-4 w-4" /> Generate</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {warnings.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {roster ? (
            <div ref={printRef} className="space-y-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40 font-semibold">Shift</TableHead>
                      {DAYS.map((day, i) => (
                        <TableHead key={day} className="text-center min-w-[120px]">
                          <div className="font-semibold">{day}</div>
                          <div className="text-xs text-muted-foreground font-normal">{format(addDays(weekStart, i), 'dd/MM')}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30">
                        <div>Shift 1</div>
                        <div className="text-xs text-muted-foreground">8am – 4pm</div>
                      </TableCell>
                      {DAYS.map(day => (
                        <TableCell key={day} className="text-center">
                          {roster[day].shift1.map((cell, i) => (
                            <div key={i} className={cn("text-sm", cell.staffId ? '' : 'text-destructive font-medium')}>{cell.staffName}</div>
                          ))}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30">
                        <div>Shift 2</div>
                        <div className="text-xs text-muted-foreground">4pm – 12am</div>
                      </TableCell>
                      {DAYS.map(day => (
                        <TableCell key={day} className="text-center">
                          {roster[day].shift2.map((cell, i) => (
                            <div key={i} className={cn("text-sm", cell.staffId ? '' : 'text-destructive font-medium')}>{cell.staffName}</div>
                          ))}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Weekly Summary</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-center">Total Shifts</TableHead>
                      <TableHead className="text-center">Total Hours</TableHead>
                      <TableHead className="text-center">Overtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map(s => (
                      <TableRow key={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-center">{s.totalShifts}</TableCell>
                        <TableCell className="text-center">{s.totalHours}h</TableCell>
                        <TableCell className="text-center">
                          {s.isOvertime ? (
                            <Badge variant="destructive" className="text-xs">{s.totalHours - 45}h OT</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-2 flex-wrap print:hidden">
                <Button variant="outline" onClick={generateRoster} className="gap-2"><RefreshCw className="h-4 w-4" /> Generate Again</Button>
                <Button variant="outline" onClick={clearRoster} className="gap-2"><X className="h-4 w-4" /> Clear Roster</Button>
                <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Shuffle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a week and click "Generate" to create a roster</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function Roster() {
  const [doctorStaff, setDoctorStaff] = useState<StaffMember[]>([]);
  const [supportStaff, setSupportStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, position')
        .not('position', 'is', null);
      if (data) {
        const all = data.map(p => ({ id: p.id, name: p.full_name || 'Unknown', position: p.position || '' }));
        setDoctorStaff(all.filter(s => DOCTOR_POSITIONS.includes(s.position)));
        setSupportStaff(all.filter(s => SUPPORT_POSITIONS.includes(s.position)));
      }
    };
    fetchProfiles();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Roster Generator</h1>
          <p className="text-sm text-muted-foreground">Generate weekly shift rosters with configurable rules</p>
        </div>
      </div>

      <Tabs defaultValue="doctor" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="doctor" className="gap-2">
            <Stethoscope className="h-4 w-4" /> Doctor Roster
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-2">
            <UserCog className="h-4 w-4" /> Support Staff Roster
          </TabsTrigger>
        </TabsList>

        <TabsContent value="doctor" className="mt-6">
          <RosterPanel initialStaff={doctorStaff} title="Doctor Roster" rosterType="doctor" />
        </TabsContent>

        <TabsContent value="support" className="mt-6">
          <RosterPanel initialStaff={supportStaff} title="Support Staff Roster" rosterType="support" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
