import { useState, useEffect, useRef, useMemo } from 'react';
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
  CalendarDays, Plus, Trash2, RefreshCw, Download, Printer, AlertTriangle, X, Users, Settings2, Shuffle, Stethoscope, UserCog, ChevronLeft, ChevronRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getISOWeek, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';

interface StaffMember {
  id: string;
  name: string;
  position: string;
}

interface RosterCell {
  staffId: string;
  staffName: string;
}

interface RosterData {
  [dateKey: string]: { shift1: RosterCell[]; shift2: RosterCell[] };
}

interface StaffSummary {
  name: string;
  totalShifts: number;
  totalHours: number;
  isOvertime: boolean;
}

const SHIFT_HOURS = 8;
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INDICES = [1, 2, 3, 4, 5]; // Mon-Fri

const DOCTOR_POSITIONS = ['Doctor'];
const SUPPORT_POSITIONS = ['Clinic Assistant', 'Staff Nurse', 'Medical Assistant'];

function firstName(name: string) {
  return name.split(' ')[0];
}

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

  // Month picker state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [roster, setRoster] = useState<RosterData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [staffPerShift, setStaffPerShift] = useState(2);

  // Compute days of month
  const monthDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [selectedMonth, selectedYear]);

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

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const generateRoster = () => {
    if (staffList.length === 0) { toast.error('Add at least one staff member first'); return; }

    const newRoster: RosterData = {};
    // Track hours per staff per ISO week
    const weekHours: Record<string, Record<number, number>> = {};
    staffList.forEach(s => { weekHours[s.id] = {}; });

    const getWeekHours = (staffId: string, week: number) => weekHours[staffId][week] || 0;
    const addWeekHours = (staffId: string, week: number, hours: number) => {
      weekHours[staffId][week] = (weekHours[staffId][week] || 0) + hours;
    };

    const newWarnings: string[] = [];

    for (const day of monthDays) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayOfWeek = getDay(day);
      const isWeekday = WEEKDAY_INDICES.includes(dayOfWeek);
      const isoWeek = getISOWeek(day);
      const assignedToday = new Set<string>();

      // Track total monthly hours for weighted fairness
      const getMonthHours = (staffId: string) => {
        let total = 0;
        for (const w of Object.values(weekHours[staffId] || {})) total += w;
        return total;
      };

      const weightedRandomPick = (pool: StaffMember[]): StaffMember => {
        if (pool.length === 1) return pool[0];
        const monthHours = pool.map(s => getMonthHours(s.id));
        const maxH = Math.max(...monthHours, 1);
        const weights = pool.map((s, i) => maxH - monthHours[i] + 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i];
          if (r <= 0) return pool[i];
        }
        return pool[pool.length - 1];
      };

      const pickStaff = (shiftNum: 1 | 2): RosterCell[] => {
        const cells: RosterCell[] = [];
        for (let i = 0; i < staffPerShift; i++) {
          let eligible = staffList.filter(s => !assignedToday.has(s.id));

          if (weekdayConstraintEnabled && isWeekday && shiftNum === 2) {
            eligible = eligible.filter(s => !constrainedStaffIds.includes(s.id));
          }

          if (maxHoursEnabled) {
            eligible = eligible.filter(s => getWeekHours(s.id, isoWeek) + SHIFT_HOURS <= 48);
          }

          // Fallback: relax hour cap
          if (eligible.length === 0) {
            eligible = staffList.filter(s => !assignedToday.has(s.id));
            if (weekdayConstraintEnabled && isWeekday && shiftNum === 2) {
              eligible = eligible.filter(s => !constrainedStaffIds.includes(s.id));
            }
          }

          // Fallback 2: anyone not assigned today
          if (eligible.length === 0) {
            eligible = staffList.filter(s => !assignedToday.has(s.id));
          }

          // Final fallback: anyone
          if (eligible.length === 0) {
            eligible = [...staffList];
          }

          if (eligible.length > 0) {
            // Prioritize staff below 45h/week, then use weighted random by monthly hours
            const below45 = eligible.filter(s => getWeekHours(s.id, isoWeek) < 45);
            const pool = below45.length > 0 ? below45 : eligible;
            const pick = weightedRandomPick(pool);

            if (getWeekHours(pick.id, isoWeek) + SHIFT_HOURS > 48) {
              newWarnings.push(`${format(day, 'dd MMM')} Shift ${shiftNum}: ${firstName(pick.name)} forced (exceeds 48h week ${isoWeek})`);
            }

            assignedToday.add(pick.id);
            addWeekHours(pick.id, isoWeek, SHIFT_HOURS);
            cells.push({ staffId: pick.id, staffName: pick.name });
          }
        }
        return cells;
      };

      newRoster[dateKey] = { shift1: pickStaff(1), shift2: pickStaff(2) };
    }

    // ─── Top-up pass: enforce 45h minimum per week per staff ───
    if (maxHoursEnabled) {
      const allWeeks = new Set<number>();
      const weekDaysMap: Record<number, Date[]> = {};
      monthDays.forEach(d => {
        const w = getISOWeek(d);
        allWeeks.add(w);
        if (!weekDaysMap[w]) weekDaysMap[w] = [];
        weekDaysMap[w].push(d);
      });

      // Recalculate weekHours from roster (in case of any drift)
      staffList.forEach(s => { weekHours[s.id] = {}; });
      for (const day of monthDays) {
        const dateKey = format(day, 'yyyy-MM-dd');
        const isoWeek = getISOWeek(day);
        const r = newRoster[dateKey];
        if (!r) continue;
        [...r.shift1, ...r.shift2].forEach(cell => {
          if (cell.staffId) addWeekHours(cell.staffId, isoWeek, SHIFT_HOURS);
        });
      }

      // For each week, top up staff below 45h by swapping them into slots held by the most-assigned staff
      let changed = true;
      let iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        for (const week of allWeeks) {
          const daysInWeek = weekDaysMap[week] || [];
          // Find staff below 45h this week who have at least 1 shift
          const underStaff = staffList.filter(s => {
            const hrs = getWeekHours(s.id, week);
            return hrs > 0 && hrs < 45;
          }).sort((a, b) => getWeekHours(a.id, week) - getWeekHours(b.id, week));

          for (const under of underStaff) {
            if (getWeekHours(under.id, week) >= 45) continue;

            // Find slots in this week where under is not already assigned that day
            for (const day of daysInWeek) {
              if (getWeekHours(under.id, week) >= 45) break;
              const dateKey = format(day, 'yyyy-MM-dd');
              const r = newRoster[dateKey];
              if (!r) continue;

              // Check if under is already assigned today
              const assignedTodayIds = [...r.shift1, ...r.shift2].map(c => c.staffId);
              if (assignedTodayIds.includes(under.id)) continue;

              // Find the cell with the staff member who has the most hours this week
              for (const shiftKey of ['shift1', 'shift2'] as const) {
                if (getWeekHours(under.id, week) >= 45) break;
                const cells = r[shiftKey];
                let bestIdx = -1;
                let bestHours = -1;
                for (let ci = 0; ci < cells.length; ci++) {
                  const cellHrs = getWeekHours(cells[ci].staffId, week);
                  // Only swap if the donor has more hours than the under-assigned staff AND donor won't go below 45h
                  if (cellHrs > bestHours && cellHrs > getWeekHours(under.id, week) + SHIFT_HOURS) {
                    bestIdx = ci;
                    bestHours = cellHrs;
                  }
                }
                if (bestIdx >= 0) {
                  const donor = cells[bestIdx];
                  const donorNewHrs = getWeekHours(donor.staffId, week) - SHIFT_HOURS;
                  // Only swap if donor stays >= 45h or donor also needs hours (prefer keeping donor >= 45)
                  if (donorNewHrs >= 45 || donorNewHrs >= getWeekHours(under.id, week)) {
                    // Perform swap
                    weekHours[donor.staffId][week] -= SHIFT_HOURS;
                    weekHours[under.id][week] = (weekHours[under.id][week] || 0) + SHIFT_HOURS;
                    const updatedCells = [...cells];
                    updatedCells[bestIdx] = { staffId: under.id, staffName: under.name };
                    newRoster[dateKey] = { ...newRoster[dateKey], [shiftKey]: updatedCells };
                    changed = true;
                  }
                }
              }
            }
          }
        }
      }

      // Post top-up: warn only if still below 45h after all swaps
      staffList.forEach(s => {
        allWeeks.forEach(week => {
          const hrs = getWeekHours(s.id, week);
          if (hrs > 0 && hrs < 45) {
            // Check if it's a partial week (start/end of month)
            const daysInWeek = weekDaysMap[week]?.length || 0;
            if (daysInWeek < 7) {
              newWarnings.push(`${s.name}: ${hrs}h in week ${week} (partial week — ${daysInWeek} days in month)`);
            } else {
              newWarnings.push(`${s.name}: Only ${hrs}h in week ${week} (below 45h minimum)`);
            }
          }
        });
      });
    }

    // ─── Global balancing pass: swap shifts to minimise monthly hour spread ───
    {
      const calcMonthHours = (sid: string) => {
        let total = 0;
        for (const dk of Object.keys(newRoster)) {
          const r = newRoster[dk];
          [...r.shift1, ...r.shift2].forEach(c => { if (c.staffId === sid) total += SHIFT_HOURS; });
        }
        return total;
      };

      let balanceIter = 0;
      let improved = true;
      while (improved && balanceIter < 200) {
        improved = false;
        balanceIter++;
        const monthHrs = staffList.map(s => ({ id: s.id, name: s.name, hours: calcMonthHours(s.id) }));
        monthHrs.sort((a, b) => b.hours - a.hours);
        const highest = monthHrs[0];
        const lowest = monthHrs[monthHrs.length - 1];
        if (highest.hours - lowest.hours <= SHIFT_HOURS) break;

        // Try to find a day where highest works but lowest doesn't, and swap
        for (const day of monthDays) {
          const dateKey = format(day, 'yyyy-MM-dd');
          const r = newRoster[dateKey];
          if (!r) continue;
          const todayIds = [...r.shift1, ...r.shift2].map(c => c.staffId);
          if (!todayIds.includes(highest.id)) continue;
          if (todayIds.includes(lowest.id)) continue; // lowest already works today

          for (const shiftKey of ['shift1', 'shift2'] as const) {
            const cells = r[shiftKey];
            const idx = cells.findIndex(c => c.staffId === highest.id);
            if (idx < 0) continue;

            // Check weekday constraint
            const dayOfWeek = getDay(day);
            const isWkday = WEEKDAY_INDICES.includes(dayOfWeek);
            if (weekdayConstraintEnabled && isWkday && shiftKey === 'shift2' && constrainedStaffIds.includes(lowest.id)) continue;

            // Perform swap
            const updatedCells = [...cells];
            const lowestStaff = staffList.find(s => s.id === lowest.id)!;
            updatedCells[idx] = { staffId: lowest.id, staffName: lowestStaff.name };
            newRoster[dateKey] = { ...newRoster[dateKey], [shiftKey]: updatedCells };
            improved = true;
            break;
          }
          if (improved) break;
        }
      }
    }

    setRoster(newRoster);
    setWarnings(newWarnings);
    if (newWarnings.length === 0) toast.success('Roster generated successfully!');
    else toast.warning(`Roster generated with ${newWarnings.length} warning(s)`);
  };

  const clearRoster = () => { setRoster(null); setWarnings([]); };

  // Manual cell change
  const updateCell = (dateKey: string, shift: 'shift1' | 'shift2', index: number, newStaffId: string) => {
    if (!roster) return;
    const staff = staffList.find(s => s.id === newStaffId);
    if (!staff) return;
    setRoster(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const dayData = { ...updated[dateKey] };
      const cells = [...dayData[shift]];
      cells[index] = { staffId: staff.id, staffName: staff.name };
      dayData[shift] = cells;
      updated[dateKey] = dayData;
      return updated;
    });
  };

  const getSummary = (): StaffSummary[] => {
    if (!roster) return [];
    const hours: Record<string, number> = {};
    const shifts: Record<string, number> = {};
    staffList.forEach(s => { hours[s.id] = 0; shifts[s.id] = 0; });
    for (const dateKey of Object.keys(roster)) {
      const r = roster[dateKey];
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
      isOvertime: (hours[s.id] || 0) > 48 * Math.ceil(monthDays.length / 7),
    }));
  };

  const exportCSV = () => {
    if (!roster) return;
    const monthLabel = format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');
    const rows: string[] = [];
    rows.push(`${title} — ${monthLabel}`);
    const headers = ['Shift', ...monthDays.map(d => format(d, 'dd'))];
    rows.push(headers.join(','));

    const shift1Row = ['Shift 1 (8am-4pm)'];
    const shift2Row = ['Shift 2 (4pm-12am)'];
    for (const day of monthDays) {
      const key = format(day, 'yyyy-MM-dd');
      const r = roster[key];
      shift1Row.push(r ? r.shift1.map(c => firstName(c.staffName)).join('/') : '');
      shift2Row.push(r ? r.shift2.map(c => firstName(c.staffName)).join('/') : '');
    }
    rows.push(shift1Row.join(','));
    rows.push(shift2Row.join(','));
    rows.push('');
    rows.push('Staff,Total Shifts,Total Hours');
    getSummary().forEach(s => {
      rows.push(`${s.name},${s.totalShifts},${s.totalHours}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-${rosterType}-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const summary = getSummary();
  const fairnessMetrics = useMemo(() => {
    if (summary.length === 0) return null;
    const hours = summary.map(s => s.totalHours);
    const maxH = Math.max(...hours);
    const minH = Math.min(...hours);
    const spread = maxH - minH;
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const score = avg > 0 ? Math.max(0, Math.min(100, Math.round(100 - (spread / avg) * 100))) : 100;
    return { maxH, minH, spread, avg: Math.round(avg), score };
  }, [summary]);
  const monthLabel = format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');

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
                   <Label htmlFor={`maxHours-${rosterType}`} className="text-sm font-medium">Working hours: 45–48 hours per week</Label>
                   <p className="text-xs text-muted-foreground">Minimum 45h, maximum 48h per calendar week. Hours beyond 48 will be flagged as overtime</p>
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
              {/* Month Picker */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-center cursor-default">
                  <CalendarDays className="h-4 w-4" />
                  {monthLabel}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={generateRoster} className="gap-2"><Shuffle className="h-4 w-4" /> Generate</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {warnings.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="text-xs space-y-1 list-disc list-inside max-h-40 overflow-y-auto">
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
                    {/* Week number row */}
                    <TableRow>
                      <TableHead className="w-32 sticky left-0 bg-background z-10 text-center text-xs font-semibold">Week</TableHead>
                      {(() => {
                        const groups: { week: number; span: number }[] = [];
                        monthDays.forEach(day => {
                          const w = getISOWeek(day);
                          if (groups.length > 0 && groups[groups.length - 1].week === w) {
                            groups[groups.length - 1].span++;
                          } else {
                            groups.push({ week: w, span: 1 });
                          }
                        });
                        return groups.map((g, i) => (
                          <TableHead
                            key={g.week}
                            colSpan={g.span}
                            className={cn("text-center text-xs font-semibold border-x", i % 2 === 0 ? "bg-primary/10" : "bg-accent/30")}
                          >
                            Week {g.week}
                          </TableHead>
                        ));
                      })()}
                    </TableRow>
                    {/* Day headers row */}
                    <TableRow>
                      <TableHead className="w-32 font-semibold sticky left-0 bg-background z-10">Shift</TableHead>
                      {monthDays.map(day => {
                        const isWkend = isWeekend(day);
                        return (
                          <TableHead key={day.toISOString()} className={cn("text-center min-w-[80px]", isWkend && "bg-muted/30")}>
                            <div className="font-semibold text-xs">{DAY_ABBR[getDay(day)]}</div>
                            <div className="text-xs text-muted-foreground font-normal">{format(day, 'd')}</div>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 1</div>
                        <div className="text-[10px] text-muted-foreground">8am–4pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const cells = roster[dateKey]?.shift1 || [];
                        return (
                          <TableCell key={dateKey} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20")}>
                            {cells.map((cell, i) => (
                              <Select key={i} value={cell.staffId} onValueChange={v => updateCell(dateKey, 'shift1', i, v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ))}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 2</div>
                        <div className="text-[10px] text-muted-foreground">4pm–12am</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const cells = roster[dateKey]?.shift2 || [];
                        return (
                          <TableCell key={dateKey} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20")}>
                            {cells.map((cell, i) => (
                              <Select key={i} value={cell.staffId} onValueChange={v => updateCell(dateKey, 'shift2', i, v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ))}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Monthly Summary — {monthLabel}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-center">Total Shifts</TableHead>
                      <TableHead className="text-center">Total Hours</TableHead>
                      <TableHead className="text-center">Status</TableHead>
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
                            <Badge variant="destructive" className="text-xs">Overtime</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Fairness Score */}
                {fairnessMetrics && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Fairness:</span>
                    <Badge
                      variant={fairnessMetrics.score >= 90 ? 'secondary' : 'destructive'}
                      className={cn("text-xs", fairnessMetrics.score >= 90 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : fairnessMetrics.score >= 70 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : "")}
                    >
                      {fairnessMetrics.score}% balanced
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Spread: {fairnessMetrics.maxH}h − {fairnessMetrics.minH}h = {fairnessMetrics.spread}h difference · Avg: {fairnessMetrics.avg}h
                    </span>
                  </div>
                )}
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
              <p className="text-sm">Select a month and click "Generate" to create a roster</p>
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
          <p className="text-sm text-muted-foreground">Generate monthly shift rosters with configurable rules</p>
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
