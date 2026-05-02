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
  CalendarDays, Plus, Trash2, RefreshCw, Download, Printer, AlertTriangle, X, Users, Settings2, Shuffle, Stethoscope, UserCog, ChevronLeft, ChevronRight, Save, Info, ShieldAlert
} from 'lucide-react';
import DoctorRosterPanel from '@/components/staff/roster/DoctorRosterPanel';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getISOWeek, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { usePublicHolidays, useAddPublicHoliday, useDeletePublicHoliday } from '@/hooks/usePublicHolidays';

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
  [dateKey: string]: { shift1: RosterCell[]; shift2: RosterCell[]; hybrid?: RosterCell[] };
}

interface StaffSummary {
  name: string;
  shift1Count: number;
  shift2Count: number;
  hybridShifts: number;
  totalShifts: number;
  totalWorkingDays: number;
  totalHours: number;
  isOvertime: boolean;
}

interface RosterSettings {
  [userId: string]: {
    hybridType: string | null;
    permanentOffDays: number[];
  };
}

interface RosterWarning {
  type: 'coverage' | 'compliance' | 'info';
  message: string;
}

const SHIFT_HOURS = 8;
const HYBRID_HOURS = 5; // 8am-1pm
const OT_THRESHOLD = 45; // hours per week
const MAX_CONSECUTIVE_DAYS = 6;
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INDICES = [1, 2, 3, 4, 5]; // Mon-Fri

const DOCTOR_POSITIONS = ['Doctor'];
const SUPPORT_POSITIONS = ['Clinic Assistant', 'Staff Nurse', 'Medical Assistant'];

function firstName(name: string) {
  return name.split(' ')[0];
}

// ─── Warning display helpers ────────────────────────────────────────

function WarningSection({ warnings }: { warnings: RosterWarning[] }) {
  const coverage = warnings.filter(w => w.type === 'coverage');
  const compliance = warnings.filter(w => w.type === 'compliance');
  const info = warnings.filter(w => w.type === 'info');

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {coverage.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium text-xs mb-1">Coverage Warnings ({coverage.length})</p>
            <ul className="text-xs space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto">
              {coverage.map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {compliance.length > 0 && (
        <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <AlertDescription>
            <p className="font-medium text-xs mb-1 text-orange-800 dark:text-orange-300">Compliance Warnings ({compliance.length})</p>
            <ul className="text-xs space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto text-orange-700 dark:text-orange-400">
              {compliance.map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {info.length > 0 && (
        <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <p className="font-medium text-xs mb-1 text-blue-800 dark:text-blue-300">Informational ({info.length})</p>
            <ul className="text-xs space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto text-blue-700 dark:text-blue-400">
              {info.map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
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
  const [warnings, setWarnings] = useState<RosterWarning[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [staffPerShift1, setStaffPerShift1] = useState(1);
  const [staffPerShift2, setStaffPerShift2] = useState(2);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Roster settings (hybrid type + permanent off days)
  const [rosterSettings, setRosterSettings] = useState<RosterSettings>({});
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Compute days of month
  const monthDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [selectedMonth, selectedYear]);

  // Public holidays
  const { data: publicHolidays = [] } = usePublicHolidays();
  const addHolidayMutation = useAddPublicHoliday();
  const deleteHolidayMutation = useDeletePublicHoliday();
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const holidaySet = useMemo(() => new Set(publicHolidays.map(h => h.holiday_date)), [publicHolidays]);
  const monthHolidays = useMemo(
    () => publicHolidays.filter(h => {
      const d = new Date(h.holiday_date + 'T00:00:00');
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }),
    [publicHolidays, selectedMonth, selectedYear]
  );
  const isPublicHoliday = (dateKey: string) => holidaySet.has(dateKey);

  useEffect(() => { setStaffList(initialStaff); }, [initialStaff]);

  // Load roster settings
  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);
      const { data } = await supabase.from('staff_roster_settings').select('*');
      if (data) {
        const settings: RosterSettings = {};
        data.forEach((r: any) => {
          settings[r.user_id] = {
            hybridType: r.hybrid_type || null,
            permanentOffDays: r.permanent_off_days || [],
          };
        });
        setRosterSettings(settings);
      }
      setSettingsLoading(false);
    };
    loadSettings();
  }, []);

  // ─── Auto-load saved roster on month change ───
  useEffect(() => {
    const loadSaved = async () => {
      const { data } = await supabase
        .from('saved_rosters')
        .select('*')
        .eq('roster_type', rosterType)
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle();
      if (data) {
        setRoster(data.roster_data as unknown as RosterData);
        if (data.staff_list && (data.staff_list as unknown as StaffMember[]).length > 0) {
          setStaffList(data.staff_list as unknown as StaffMember[]);
        }
        // Convert legacy flat warnings to structured format
        const loadedWarnings = data.warnings as unknown as any[];
        if (loadedWarnings && loadedWarnings.length > 0) {
          if (typeof loadedWarnings[0] === 'string') {
            setWarnings(loadedWarnings.map((w: string) => ({ type: 'info' as const, message: w })));
          } else {
            setWarnings(loadedWarnings as RosterWarning[]);
          }
        } else {
          setWarnings([]);
        }
        setSavedAt(data.updated_at);
        toast.info('Saved roster loaded');
      } else {
        setSavedAt(null);
      }
    };
    loadSaved();
  }, [selectedMonth, selectedYear, rosterType]);

  const saveRoster = async () => {
    if (!roster) { toast.error('No roster to save'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Please sign in to save'); setSaving(false); return; }

    const payload = {
      roster_type: rosterType,
      month: selectedMonth,
      year: selectedYear,
      roster_data: roster as unknown as Record<string, unknown>,
      staff_list: staffList as unknown as Record<string, unknown>[],
      warnings: warnings as unknown as Record<string, unknown>[],
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('saved_rosters')
      .upsert([payload] as any, { onConflict: 'roster_type,month,year' });

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      setSavedAt(new Date().toISOString());
      toast.success('Roster saved!');
    }
    setSaving(false);
  };

  // Save roster settings
  const saveRosterSetting = async (userId: string, hybridType: string | null, permanentOffDays: number[]) => {
    const { error } = await supabase.from('staff_roster_settings').upsert({
      user_id: userId,
      hybrid_type: hybridType,
      permanent_off_days: permanentOffDays,
    } as any, { onConflict: 'user_id' });
    if (error) {
      toast.error('Failed to save setting');
    } else {
      setRosterSettings(prev => ({ ...prev, [userId]: { hybridType, permanentOffDays } }));
    }
  };

  const handleHybridTypeChange = (userId: string, value: string) => {
    const hybridType = value === 'none' ? null : value;
    const current = rosterSettings[userId] || { hybridType: null, permanentOffDays: [] };
    saveRosterSetting(userId, hybridType, current.permanentOffDays);
  };

  const handleOffDayToggle = (userId: string, dayIndex: number) => {
    const current = rosterSettings[userId] || { hybridType: null, permanentOffDays: [] };
    const newDays = current.permanentOffDays.includes(dayIndex)
      ? current.permanentOffDays.filter(d => d !== dayIndex)
      : [...current.permanentOffDays, dayIndex];
    saveRosterSetting(userId, current.hybridType, newDays);
  };

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

  // Get hybrid staff
  const hybridStaff = useMemo(() => {
    return staffList.filter(s => {
      const setting = rosterSettings[s.id];
      return setting?.hybridType === 'purchaser' || setting?.hybridType === 'housecall_nurse';
    });
  }, [staffList, rosterSettings]);

  // ─── ROSTER GENERATION — Staff Roster Criteria Framework ───────────

  const generateRoster = () => {
    if (staffList.length === 0) { toast.error('Add at least one staff member first'); return; }

    const newRoster: RosterData = {};
    // Track hours per staff per ISO week
    const weekHours: Record<string, Record<number, number>> = {};
    staffList.forEach(s => { weekHours[s.id] = {}; });

    // Track consecutive working days per staff
    const consecutiveDays: Record<string, number> = {};
    staffList.forEach(s => { consecutiveDays[s.id] = 0; });

    const getWeekHours = (staffId: string, week: number) => weekHours[staffId]?.[week] || 0;
    const addWeekHours = (staffId: string, week: number, hours: number) => {
      if (!weekHours[staffId]) weekHours[staffId] = {};
      weekHours[staffId][week] = (weekHours[staffId][week] || 0) + hours;
    };

    const newWarnings: RosterWarning[] = [];

    // Sort days chronologically for consecutive tracking
    const sortedDays = [...monthDays].sort((a, b) => a.getTime() - b.getTime());

    // Helper: check if staff has off day on a specific day of week
    const isOffDayOn = (staffId: string, dow: number) => {
      const setting = rosterSettings[staffId];
      return setting?.permanentOffDays?.includes(dow) || false;
    };

    // Determine effective staff per shift (auto-adjust for low headcount)
    const effectiveS1Count = staffList.length <= 4 ? 1 : staffPerShift1;
    const effectiveS2Count = staffList.length <= 4 ? 2 : staffPerShift2;
    // Minimum staffing floors (hard rule 1.2)
    const minS1 = 1;
    const minS2 = 2;

    for (const day of sortedDays) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayOfWeek = getDay(day);
      const isWeekday = WEEKDAY_INDICES.includes(dayOfWeek);
      const isoWeek = getISOWeek(day);
      const assignedToday = new Set<string>();

      // Public holiday — leave the day empty for all shifts
      if (isPublicHoliday(dateKey)) {
        newRoster[dateKey] = { shift1: [], shift2: [], hybrid: undefined };
        const ph = publicHolidays.find(h => h.holiday_date === dateKey);
        newWarnings.push({
          type: 'info',
          message: `${format(day, 'dd MMM')}: Public holiday${ph ? ` (${ph.name})` : ''} — no staff assigned`,
        });
        // Reset consecutive day counters since no one is working
        staffList.forEach(s => { consecutiveDays[s.id] = 0; });
        continue;
      }

      // Track total monthly hours for weighted fairness
      const getMonthHours = (staffId: string) => {
        let total = 0;
        for (const w of Object.values(weekHours[staffId] || {})) total += w;
        return total;
      };

      // HARD RULE 1.1: Check permanent off day — never bypassed
      const isOffDay = (staffId: string) => isOffDayOn(staffId, dayOfWeek);

      // HARD RULE 1.3: Check consecutive day limit
      const isAtConsecutiveLimit = (staffId: string) => {
        return (consecutiveDays[staffId] || 0) >= MAX_CONSECUTIVE_DAYS;
      };

      const weightedRandomPick = (pool: StaffMember[]): StaffMember => {
        if (pool.length === 1) return pool[0];
        const monthHours = pool.map(s => getMonthHours(s.id));
        const maxH = Math.max(...monthHours, 1);
        // Favor staff with lower monthly hours
        const weights = pool.map((s, i) => maxH - monthHours[i] + 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i];
          if (r <= 0) return pool[i];
        }
        return pool[pool.length - 1];
      };

      // ─── RULE 1.6: Hybrid row is manual — preserve existing, don't auto-populate ───
      const hybridCells: RosterCell[] = [];
      if (roster && roster[dateKey]?.hybrid) {
        for (const existing of roster[dateKey].hybrid!) {
          if (hybridStaff.some(hs => hs.id === existing.staffId) && !isOffDay(existing.staffId)) {
            hybridCells.push(existing);
            assignedToday.add(existing.staffId);
            addWeekHours(existing.staffId, isoWeek, HYBRID_HOURS);
          }
        }
      }

      // ─── pickStaff: strict priority-ordered eligibility ───
      const pickStaff = (shiftNum: 1 | 2): RosterCell[] => {
        const cells: RosterCell[] = [];
        const targetCount = shiftNum === 1 ? effectiveS1Count : effectiveS2Count;
        const minCount = shiftNum === 1 ? minS1 : minS2;
        const slotsNeeded = Math.max(targetCount, minCount);

        for (let i = 0; i < slotsNeeded; i++) {
          // RULE 1.5: Hybrid staff ARE eligible for regular shifts (not excluded)
          // Priority 1: Filter by permanent off day (NEVER bypassed)
          let eligible = staffList.filter(s =>
            !assignedToday.has(s.id) &&
            !isOffDay(s.id)
          );

          // Priority 5: Apply weekday Shift 2 restriction (soft rule 2.2)
          if (weekdayConstraintEnabled && isWeekday && shiftNum === 2) {
            const unrestricted = eligible.filter(s => !constrainedStaffIds.includes(s.id));
            if (unrestricted.length > 0) eligible = unrestricted;
          }

          // Priority 3: Apply consecutive day limit
          const underLimit = eligible.filter(s => !isAtConsecutiveLimit(s.id));

          // Priority 6: Apply OT threshold (soft)
          let pool: StaffMember[];
          if (maxHoursEnabled) {
            const underOT = underLimit.filter(s => getWeekHours(s.id, isoWeek) + SHIFT_HOURS <= OT_THRESHOLD);
            pool = underOT.length > 0 ? underOT : underLimit;
          } else {
            pool = underLimit;
          }

          // RULE 1.3 exception: If no staff under consecutive limit, allow breach
          // but ONLY if leaving empty would cause understaffing
          if (pool.length === 0 && eligible.length > 0) {
            const filledSoFar = cells.length;
            const wouldBeUnderstaffed = filledSoFar < minCount;

            if (wouldBeUnderstaffed) {
              // Breach allowed — record as roster exception
              pool = eligible;
              const pick = weightedRandomPick(pool);
              newWarnings.push({
                type: 'compliance',
                message: `${format(day, 'dd MMM')} Shift ${shiftNum}: ${firstName(pick.name)} exceeds ${MAX_CONSECUTIVE_DAYS} consecutive days (exception — no other eligible staff)`
              });
              assignedToday.add(pick.id);
              addWeekHours(pick.id, isoWeek, SHIFT_HOURS);
              cells.push({ staffId: pick.id, staffName: pick.name });
              continue;
            }
            // Not understaffed — prefer empty slot (RULE 1.4)
          }

          // RULE 1.4: Empty slot over invalid assignment
          if (pool.length === 0) {
            if (cells.length < minCount) {
              newWarnings.push({
                type: 'coverage',
                message: `${format(day, 'dd MMM')} Shift ${shiftNum}: Not enough eligible staff — slot left empty (minimum ${minCount} required)`
              });
            }
            continue;
          }

          // Priority 7: Weighted fair pick among eligible
          const below45 = pool.filter(s => getWeekHours(s.id, isoWeek) < OT_THRESHOLD);
          const finalPool = below45.length > 0 ? below45 : pool;
          const pick = weightedRandomPick(finalPool);

          if (getWeekHours(pick.id, isoWeek) + SHIFT_HOURS > OT_THRESHOLD) {
            newWarnings.push({
              type: 'compliance',
              message: `${format(day, 'dd MMM')} Shift ${shiftNum}: ${firstName(pick.name)} exceeds ${OT_THRESHOLD}h in week ${isoWeek} (OT)`
            });
          }

          assignedToday.add(pick.id);
          addWeekHours(pick.id, isoWeek, SHIFT_HOURS);
          cells.push({ staffId: pick.id, staffName: pick.name });
        }

        // Check if minimum staffing met
        if (cells.length < minCount) {
          newWarnings.push({
            type: 'coverage',
            message: `${format(day, 'dd MMM')} Shift ${shiftNum}: Below minimum staffing (${cells.length}/${minCount})`
          });
        }

        return cells;
      };

      newRoster[dateKey] = {
        shift1: pickStaff(1),
        shift2: pickStaff(2),
        hybrid: hybridCells.length > 0 ? hybridCells : undefined,
      };

      // Update consecutive day counters
      staffList.forEach(s => {
        if (assignedToday.has(s.id)) {
          consecutiveDays[s.id] = (consecutiveDays[s.id] || 0) + 1;
        } else {
          consecutiveDays[s.id] = 0;
        }
      });
    }

    // ─── Top-up pass: enforce OT_THRESHOLD minimum per week per staff ───
    if (maxHoursEnabled) {
      const allWeeks = new Set<number>();
      const weekDaysMap: Record<number, Date[]> = {};
      monthDays.forEach(d => {
        const w = getISOWeek(d);
        allWeeks.add(w);
        if (!weekDaysMap[w]) weekDaysMap[w] = [];
        weekDaysMap[w].push(d);
      });

      // Recalculate weekHours from roster
      staffList.forEach(s => { weekHours[s.id] = {}; });
      for (const day of monthDays) {
        const dateKey = format(day, 'yyyy-MM-dd');
        const isoWeek = getISOWeek(day);
        const r = newRoster[dateKey];
        if (!r) continue;
        [...r.shift1, ...r.shift2].forEach(cell => {
          if (cell.staffId) addWeekHours(cell.staffId, isoWeek, SHIFT_HOURS);
        });
        if (r.hybrid) {
          r.hybrid.forEach(cell => {
            if (cell.staffId) addWeekHours(cell.staffId, isoWeek, HYBRID_HOURS);
          });
        }
      }

      // Recalculate consecutive days for top-up pass checks
      const recalcConsecutive = () => {
        const cons: Record<string, number> = {};
        staffList.forEach(s => { cons[s.id] = 0; });
        for (const day of sortedDays) {
          const dateKey = format(day, 'yyyy-MM-dd');
          const r = newRoster[dateKey];
          if (!r) continue;
          const assignedIds = new Set([...r.shift1, ...r.shift2, ...(r.hybrid || [])].map(c => c.staffId));
          staffList.forEach(s => {
            if (assignedIds.has(s.id)) cons[s.id]++;
            else cons[s.id] = 0;
          });
        }
        return cons;
      };

      let changed = true;
      let iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        for (const week of allWeeks) {
          const daysInWeek = weekDaysMap[week] || [];
          const underStaff = staffList.filter(s => {
            const hrs = getWeekHours(s.id, week);
            return hrs > 0 && hrs < OT_THRESHOLD;
          }).sort((a, b) => getWeekHours(a.id, week) - getWeekHours(b.id, week));

          for (const under of underStaff) {
            if (getWeekHours(under.id, week) >= OT_THRESHOLD) continue;

            for (const day of daysInWeek) {
              if (getWeekHours(under.id, week) >= OT_THRESHOLD) break;
              const dateKey = format(day, 'yyyy-MM-dd');
              const r = newRoster[dateKey];
              if (!r) continue;

              const assignedTodayIds = [...r.shift1, ...r.shift2, ...(r.hybrid || [])].map(c => c.staffId);
              if (assignedTodayIds.includes(under.id)) continue;

              // HARD RULE: Respect permanent off days during balancing
              const topUpDayOfWeek = getDay(day);
              if (isOffDayOn(under.id, topUpDayOfWeek)) continue;

              // Check consecutive day limit before swapping
              const currentCons = recalcConsecutive();
              if (currentCons[under.id] >= MAX_CONSECUTIVE_DAYS) continue;

              for (const shiftKey of ['shift1', 'shift2'] as const) {
                if (getWeekHours(under.id, week) >= OT_THRESHOLD) break;
                const cells = r[shiftKey];
                let bestIdx = -1;
                let bestHours = -1;
                for (let ci = 0; ci < cells.length; ci++) {
                  const cellHrs = getWeekHours(cells[ci].staffId, week);
                  if (cellHrs > bestHours && cellHrs > getWeekHours(under.id, week) + SHIFT_HOURS) {
                    bestIdx = ci;
                    bestHours = cellHrs;
                  }
                }
                if (bestIdx >= 0) {
                  const donor = cells[bestIdx];
                  const donorNewHrs = getWeekHours(donor.staffId, week) - SHIFT_HOURS;
                  if (donorNewHrs >= OT_THRESHOLD || donorNewHrs >= getWeekHours(under.id, week)) {
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

      // Post top-up info warnings
      staffList.forEach(s => {
        allWeeks.forEach(week => {
          const hrs = getWeekHours(s.id, week);
          if (hrs > 0 && hrs < OT_THRESHOLD) {
            const daysInWeek = weekDaysMap[week]?.length || 0;
            if (daysInWeek < 7) {
              newWarnings.push({ type: 'info', message: `${s.name}: ${hrs}h in week ${week} (partial week — ${daysInWeek} days in month)` });
            } else {
              newWarnings.push({ type: 'info', message: `${s.name}: Only ${hrs}h in week ${week} (below ${OT_THRESHOLD}h)` });
            }
          }
        });
      });
    }

    // ─── Global balancing pass ───
    {
      const calcMonthHours = (sid: string) => {
        let total = 0;
        for (const dk of Object.keys(newRoster)) {
          const r = newRoster[dk];
          [...r.shift1, ...r.shift2].forEach(c => { if (c.staffId === sid) total += SHIFT_HOURS; });
          if (r.hybrid) r.hybrid.forEach(c => { if (c.staffId === sid) total += HYBRID_HOURS; });
        }
        return total;
      };

      // Recalculate consecutive for balancing
      const getConsecutiveOnDate = (sid: string, targetDate: Date): number => {
        let count = 0;
        for (const day of sortedDays) {
          if (day > targetDate) break;
          const dk = format(day, 'yyyy-MM-dd');
          const r = newRoster[dk];
          if (!r) continue;
          const ids = [...r.shift1, ...r.shift2, ...(r.hybrid || [])].map(c => c.staffId);
          if (ids.includes(sid)) count++;
          else count = 0;
        }
        return count;
      };

      let balanceIter = 0;
      let improved = true;
      while (improved && balanceIter < 200) {
        improved = false;
        balanceIter++;
        // Include all staff in balancing (hybrid staff are in regular pool now)
        if (staffList.length < 2) break;
        const monthHrs = staffList.map(s => ({ id: s.id, name: s.name, hours: calcMonthHours(s.id) }));
        monthHrs.sort((a, b) => b.hours - a.hours);
        const highest = monthHrs[0];
        const lowest = monthHrs[monthHrs.length - 1];
        if (highest.hours - lowest.hours <= SHIFT_HOURS) break;

        for (const day of monthDays) {
          const dateKey = format(day, 'yyyy-MM-dd');
          const r = newRoster[dateKey];
          if (!r) continue;
          const todayIds = [...r.shift1, ...r.shift2].map(c => c.staffId);
          if (!todayIds.includes(highest.id)) continue;
          if (todayIds.includes(lowest.id)) continue;

          // HARD RULE 1.1: Never swap someone onto their off day
          const balanceDow = getDay(day);
          if (isOffDayOn(lowest.id, balanceDow)) continue;

          // Check consecutive day limit for the swap target
          const consCount = getConsecutiveOnDate(lowest.id, day);
          if (consCount >= MAX_CONSECUTIVE_DAYS) continue;

          for (const shiftKey of ['shift1', 'shift2'] as const) {
            const cells = r[shiftKey];
            const idx = cells.findIndex(c => c.staffId === highest.id);
            if (idx < 0) continue;

            const dayOfWeek = getDay(day);
            const isWkday = WEEKDAY_INDICES.includes(dayOfWeek);
            if (weekdayConstraintEnabled && isWkday && shiftKey === 'shift2' && constrainedStaffIds.includes(lowest.id)) continue;

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
    const coverageCount = newWarnings.filter(w => w.type === 'coverage').length;
    const complianceCount = newWarnings.filter(w => w.type === 'compliance').length;
    if (newWarnings.length === 0) toast.success('Roster generated successfully!');
    else toast.warning(`Roster generated — ${coverageCount} coverage, ${complianceCount} compliance, ${newWarnings.length - coverageCount - complianceCount} info warning(s)`);
  };

  const clearRoster = () => { setRoster(null); setWarnings([]); };

  // Manual cell change
  const updateCell = (dateKey: string, shift: 'shift1' | 'shift2', index: number, newStaffId: string) => {
    if (!roster) return;
    if (newStaffId === '__none__') {
      setRoster(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        const dayData = { ...updated[dateKey] };
        const cells = [...dayData[shift]];
        cells[index] = { staffId: '', staffName: '' };
        dayData[shift] = cells;
        updated[dateKey] = dayData;
        return updated;
      });
      return;
    }
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

  // Toggle a hybrid staff member on/off for a specific day
  const toggleHybridStaff = (dateKey: string, staffId: string) => {
    if (!roster) return;
    const staff = hybridStaff.find(s => s.id === staffId);
    if (!staff) return;

    const day = new Date(dateKey + 'T00:00:00');
    const dow = getDay(day);
    const setting = rosterSettings[staffId];
    if (setting?.permanentOffDays?.includes(dow)) {
      toast.error(`${firstName(staff.name)} has an off day on ${DAY_ABBR[dow]}`);
      return;
    }

    setRoster(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const dayData = { ...updated[dateKey] };
      const currentHybrid = [...(dayData.hybrid || [])];
      const existingIdx = currentHybrid.findIndex(c => c.staffId === staffId);
      if (existingIdx >= 0) {
        currentHybrid.splice(existingIdx, 1);
      } else {
        currentHybrid.push({ staffId: staff.id, staffName: staff.name });
      }
      dayData.hybrid = currentHybrid.length > 0 ? currentHybrid : undefined;
      updated[dateKey] = dayData;
      return updated;
    });
  };

  const getSummary = (): StaffSummary[] => {
    if (!roster) return [];
    const hours: Record<string, number> = {};
    const s1Count: Record<string, number> = {};
    const s2Count: Record<string, number> = {};
    const hybridShiftsCount: Record<string, number> = {};
    const workingDays: Record<string, Set<string>> = {};
    staffList.forEach(s => {
      hours[s.id] = 0; s1Count[s.id] = 0; s2Count[s.id] = 0;
      hybridShiftsCount[s.id] = 0; workingDays[s.id] = new Set();
    });
    for (const dateKey of Object.keys(roster)) {
      const r = roster[dateKey];
      r.shift1.forEach(cell => {
        if (cell.staffId) {
          hours[cell.staffId] = (hours[cell.staffId] || 0) + SHIFT_HOURS;
          s1Count[cell.staffId] = (s1Count[cell.staffId] || 0) + 1;
          workingDays[cell.staffId]?.add(dateKey);
        }
      });
      r.shift2.forEach(cell => {
        if (cell.staffId) {
          hours[cell.staffId] = (hours[cell.staffId] || 0) + SHIFT_HOURS;
          s2Count[cell.staffId] = (s2Count[cell.staffId] || 0) + 1;
          workingDays[cell.staffId]?.add(dateKey);
        }
      });
      if (r.hybrid) {
        r.hybrid.forEach(cell => {
          if (cell.staffId) {
            hours[cell.staffId] = (hours[cell.staffId] || 0) + HYBRID_HOURS;
            hybridShiftsCount[cell.staffId] = (hybridShiftsCount[cell.staffId] || 0) + 1;
            workingDays[cell.staffId]?.add(dateKey);
          }
        });
      }
    }
    return staffList.map(s => ({
      name: s.name,
      shift1Count: s1Count[s.id] || 0,
      shift2Count: s2Count[s.id] || 0,
      totalShifts: (s1Count[s.id] || 0) + (s2Count[s.id] || 0),
      hybridShifts: hybridShiftsCount[s.id] || 0,
      totalWorkingDays: workingDays[s.id]?.size || 0,
      totalHours: hours[s.id] || 0,
      isOvertime: (hours[s.id] || 0) > OT_THRESHOLD * Math.ceil(monthDays.length / 7),
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
    const hybridRow = ['Hybrid (8am-1pm)'];
    for (const day of monthDays) {
      const key = format(day, 'yyyy-MM-dd');
      const r = roster[key];
      shift1Row.push(r ? r.shift1.map(c => firstName(c.staffName)).join('/') : '');
      shift2Row.push(r ? r.shift2.map(c => firstName(c.staffName)).join('/') : '');
      hybridRow.push(r?.hybrid ? r.hybrid.map(c => firstName(c.staffName)).join('/') : '');
    }
    rows.push(shift1Row.join(','));
    rows.push(shift2Row.join(','));
    if (hybridStaff.length > 0) rows.push(hybridRow.join(','));
    rows.push('');
    rows.push('Staff,Shift 1,Shift 2,Hybrid,Working Days,Total Hours,Status');
    getSummary().forEach(s => {
      rows.push(`${s.name},${s.shift1Count},${s.shift2Count},${s.hybridShifts},${s.totalWorkingDays},${s.totalHours},${s.isOvertime ? 'OT' : 'Normal'}`);
    });
    if (fairnessMetrics) {
      rows.push('');
      rows.push(`Fairness Score,${fairnessMetrics.score}%`);
      rows.push(`Hour Spread,${fairnessMetrics.spread}h (${fairnessMetrics.maxH}h - ${fairnessMetrics.minH}h)`);
      rows.push(`Average Hours,${fairnessMetrics.avg}h`);
    }
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
                      {rosterSettings[s.id]?.hybridType && (
                        <Badge variant="outline" className="text-xs text-primary">{rosterSettings[s.id].hybridType === 'purchaser' ? 'Purchaser' : 'Housecall'}</Badge>
                      )}
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
                   <Label htmlFor={`maxHours-${rosterType}`} className="text-sm font-medium">Working hours: max {OT_THRESHOLD} hours/week (OT beyond)</Label>
                   <p className="text-xs text-muted-foreground">Normal ≤ {OT_THRESHOLD}h/week. Hours beyond are overtime. Max {MAX_CONSECUTIVE_DAYS} consecutive working days enforced.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id={`fixedShift-${rosterType}`} checked={fixedShiftEnabled} onCheckedChange={(v) => setFixedShiftEnabled(!!v)} />
                <div>
                  <Label htmlFor={`fixedShift-${rosterType}`} className="text-sm font-medium">Fixed shift hours</Label>
                  <p className="text-xs text-muted-foreground">Shift 1: 8:00 AM – 4:00 PM · Shift 2: 4:00 PM – 12:00 AM · Hybrid: 8:00 AM – 1:00 PM</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id={`weekdayConstraint-${rosterType}`} checked={weekdayConstraintEnabled} onCheckedChange={(v) => setWeekdayConstraintEnabled(!!v)} />
                <div>
                  <Label htmlFor={`weekdayConstraint-${rosterType}`} className="text-sm font-medium">Weekday Shift 2 restriction</Label>
                  <p className="text-xs text-muted-foreground">Selected staff shall not be assigned to Shift 2 from Monday to Friday</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium whitespace-nowrap">Shift 1 staff:</Label>
                  <Select value={String(staffPerShift1)} onValueChange={v => setStaffPerShift1(Number(v))}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium whitespace-nowrap">Shift 2 staff:</Label>
                  <Select value={String(staffPerShift2)} onValueChange={v => setStaffPerShift2(Number(v))}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {staffList.length <= 4 && staffList.length > 0 && (
                  <span className="text-xs text-muted-foreground">(Auto-adjusted: S1=1, S2=2 due to ≤4 staff)</span>
                )}
              </div>
            </CardContent>
          </Card>

          {weekdayConstraintEnabled && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Weekday Shift 2 Restricted Staff</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Select staff who shall not be assigned to Shift 2 on weekdays (Mon–Fri).</p>
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

      {/* Staff Settings — Hybrid & Off Days */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Staff Settings (Hybrid & Off Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">Configure hybrid roles and permanent weekly off days. Hybrid staff remain eligible for regular shifts unless manually assigned via the hybrid row.</p>
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading settings...</p>
          ) : staffList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Add staff first</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Hybrid Type</TableHead>
                    {DAY_ABBR.map((d, i) => <TableHead key={i} className="text-center text-xs w-12">{d}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.map(s => {
                    const setting = rosterSettings[s.id] || { hybridType: null, permanentOffDays: [] };
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">{firstName(s.name)}</TableCell>
                        <TableCell>
                          <Select value={setting.hybridType || 'none'} onValueChange={v => handleHybridTypeChange(s.id, v)}>
                            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="purchaser">Purchaser</SelectItem>
                              <SelectItem value="housecall_nurse">Housecall Nurse</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {DAY_ABBR.map((_, i) => (
                          <TableCell key={i} className="text-center">
                            <Checkbox
                              checked={setting.permanentOffDays.includes(i)}
                              onCheckedChange={() => handleOffDayToggle(s.id, i)}
                              className="mx-auto"
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
          <WarningSection warnings={warnings} />

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
                        const dk = format(day, 'yyyy-MM-dd');
                        const isPH = isPublicHoliday(dk);
                        return (
                          <TableHead key={day.toISOString()} className={cn("text-center min-w-[80px]", isWkend && "bg-muted/30", isPH && "bg-destructive/10")}>
                            <div className="font-semibold text-xs">{DAY_ABBR[getDay(day)]}</div>
                            <div className="text-xs text-muted-foreground font-normal">{format(day, 'd')}</div>
                            {isPH && <div className="text-[9px] font-bold text-destructive uppercase tracking-wide mt-0.5">PH</div>}
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
                        const isPH = isPublicHoliday(dateKey);
                        return (
                          <TableCell key={dateKey} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20", isPH && "bg-destructive/5")}>
                            {cells.length === 0 && isPH && (
                              <span className="text-[10px] text-destructive/70 italic">PH</span>
                            )}
                            {cells.map((cell, i) => (
                              <Select key={i} value={cell.staffId} onValueChange={v => updateCell(dateKey, 'shift1', i, v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
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
                        const isPH = isPublicHoliday(dateKey);
                        return (
                          <TableCell key={dateKey} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20", isPH && "bg-destructive/5")}>
                            {cells.length === 0 && isPH && (
                              <span className="text-[10px] text-destructive/70 italic">PH</span>
                            )}
                            {cells.map((cell, i) => (
                              <Select key={i} value={cell.staffId} onValueChange={v => updateCell(dateKey, 'shift2', i, v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
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
                    {/* Hybrid Row — manual assignment */}
                    {hybridStaff.length > 0 && (
                      <TableRow>
                        <TableCell className="font-medium bg-blue-50 dark:bg-blue-950/30 sticky left-0 z-10">
                          <div className="text-xs">Hybrid</div>
                          <div className="text-[10px] text-muted-foreground">8am–1pm</div>
                        </TableCell>
                        {monthDays.map(day => {
                          const dateKey = format(day, 'yyyy-MM-dd');
                          const cells = roster[dateKey]?.hybrid || [];
                          const assignedIds = new Set(cells.map(c => c.staffId));
                          const dow = getDay(day);
                          return (
                            <TableCell key={dateKey} className={cn("text-center p-0.5", isWeekend(day) && "bg-muted/20")}>
                              <div className="flex flex-col gap-0.5 items-center">
                                {hybridStaff.map(hs => {
                                  const isOff = rosterSettings[hs.id]?.permanentOffDays?.includes(dow);
                                  return (
                                    <button
                                      key={hs.id}
                                      onClick={() => toggleHybridStaff(dateKey, hs.id)}
                                      disabled={isOff}
                                      className={cn(
                                        "text-[10px] px-1 py-0.5 rounded cursor-pointer transition-colors w-full truncate",
                                        assignedIds.has(hs.id)
                                          ? "bg-primary text-primary-foreground font-medium"
                                          : isOff
                                            ? "text-muted-foreground/40 line-through cursor-not-allowed"
                                            : "text-muted-foreground hover:bg-muted"
                                      )}
                                      title={isOff ? `${hs.name} — Off day` : assignedIds.has(hs.id) ? `Remove ${hs.name}` : `Assign ${hs.name}`}
                                    >
                                      {firstName(hs.name)}
                                    </button>
                                  );
                                })}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    )}
                    {/* Off / Not working row */}
                    <TableRow>
                      <TableCell className="font-medium bg-destructive/10 sticky left-0 z-10">
                        <div className="text-xs">Off</div>
                        <div className="text-[10px] text-muted-foreground">Not assigned</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const r = roster[dateKey];
                        const assignedIds = new Set<string>();
                        if (r) {
                          [...r.shift1, ...r.shift2].forEach(c => assignedIds.add(c.staffId));
                          if (r.hybrid) r.hybrid.forEach(c => assignedIds.add(c.staffId));
                        }
                        const offStaff = staffList.filter(s => !assignedIds.has(s.id));
                        return (
                          <TableCell key={dateKey} className={cn("text-center p-1 text-[10px] text-muted-foreground", isWeekend(day) && "bg-muted/20")}>
                            {offStaff.length > 0 ? offStaff.map(s => firstName(s.name)).join(', ') : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Enhanced Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Monthly Summary — {monthLabel}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-center">Shift 1</TableHead>
                      <TableHead className="text-center">Shift 2</TableHead>
                      {hybridStaff.length > 0 && <TableHead className="text-center">Hybrid</TableHead>}
                      <TableHead className="text-center">Working Days</TableHead>
                      <TableHead className="text-center">Total Hours</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map(s => (
                      <TableRow key={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-center">{s.shift1Count}</TableCell>
                        <TableCell className="text-center">{s.shift2Count}</TableCell>
                        {hybridStaff.length > 0 && <TableCell className="text-center">{s.hybridShifts}</TableCell>}
                        <TableCell className="text-center">{s.totalWorkingDays}</TableCell>
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

              <div className="flex gap-2 flex-wrap print:hidden items-center">
                <Button onClick={saveRoster} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Roster'}</Button>
                <Button variant="outline" onClick={generateRoster} className="gap-2"><RefreshCw className="h-4 w-4" /> Generate Again</Button>
                <Button variant="outline" onClick={clearRoster} className="gap-2"><X className="h-4 w-4" /> Clear Roster</Button>
                <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
                {savedAt && <span className="text-xs text-muted-foreground ml-2">Last saved: {format(new Date(savedAt), 'dd MMM yyyy, HH:mm')}</span>}
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
          <DoctorRosterPanel initialStaff={doctorStaff} />
        </TabsContent>

        <TabsContent value="support" className="mt-6">
          <RosterPanel initialStaff={supportStaff} title="Support Staff Roster" rosterType="support" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
