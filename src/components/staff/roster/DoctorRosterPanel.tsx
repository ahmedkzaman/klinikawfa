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
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Trash2, RefreshCw, Download, Printer, AlertTriangle, X, Users, Settings2, Shuffle, ChevronLeft, ChevronRight, Eraser, Zap, Save, FolderOpen
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

interface DoctorDayRoster {
  shift1: RosterCell | null; // 8am-2pm, 6h
  shift2: RosterCell | null; // 2pm-8pm, 6h
  shift3: RosterCell | null; // 8pm-12am, 4h
}

interface DoctorRosterData {
  [dateKey: string]: DoctorDayRoster;
}

interface ManualOverrides {
  [dateKey: string]: Set<'shift1' | 'shift2' | 'shift3'>;
}

interface RosterSettings {
  [userId: string]: {
    permanentOffDays: number[];
  };
}

const SHIFT1_HOURS = 6;
const SHIFT2_HOURS = 6;
const SHIFT3_HOURS = 4;
const DAYTIME_HOURS = SHIFT1_HOURS + SHIFT2_HOURS; // 12
const WEEKLY_MIN = 45;
const WEEKLY_MAX = 45; // OT threshold changed to 45h
const MAX_CONSECUTIVE_DAYS = 6;
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function firstName(name: string) {
  return name.split(' ')[0];
}

function getHoursForShift(shift: 'shift1' | 'shift2' | 'shift3') {
  if (shift === 'shift1') return SHIFT1_HOURS;
  if (shift === 'shift2') return SHIFT2_HOURS;
  return SHIFT3_HOURS;
}

interface DoctorSummary {
  id: string;
  name: string;
  weeklyRegular: Record<number, number>;
  weeklyOvertime: Record<number, number>;
  totalRegular: number;
  totalOvertime: number;
  totalHours: number;
  daytimeBlocks: number;
  nightShifts: number;
  diffFromAvg: number;
}

export default function DoctorRosterPanel({ initialStaff }: { initialStaff: StaffMember[] }) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [newStaffName, setNewStaffName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Rules
  const [ruleMaxShifts, setRuleMaxShifts] = useState(true);
  const [ruleValidCombos, setRuleValidCombos] = useState(true);
  const [ruleMinHours, setRuleMinHours] = useState(true);
  const [ruleOvertime, setRuleOvertime] = useState(true);
  const [ruleFairDist, setRuleFairDist] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [roster, setRoster] = useState<DoctorRosterData | null>(null);
  const [originalRoster, setOriginalRoster] = useState<DoctorRosterData | null>(null);
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Roster settings (permanent off days)
  const [rosterSettings, setRosterSettings] = useState<RosterSettings>({});

  const monthDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [selectedMonth, selectedYear]);

  useEffect(() => { setStaffList(initialStaff); }, [initialStaff]);

  // Load roster settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('staff_roster_settings').select('*');
      if (data) {
        const settings: RosterSettings = {};
        data.forEach((r: any) => {
          settings[r.user_id] = {
            permanentOffDays: r.permanent_off_days || [],
          };
        });
        setRosterSettings(settings);
      }
    };
    loadSettings();
  }, []);

  // Save off day setting
  const saveOffDaySetting = async (userId: string, permanentOffDays: number[]) => {
    // We need to upsert — preserve hybrid_type if it exists
    const { data: existing } = await supabase.from('staff_roster_settings').select('hybrid_type').eq('user_id', userId).maybeSingle();
    const { error } = await supabase.from('staff_roster_settings').upsert({
      user_id: userId,
      hybrid_type: (existing as any)?.hybrid_type || null,
      permanent_off_days: permanentOffDays,
    } as any, { onConflict: 'user_id' });
    if (error) {
      toast.error('Failed to save setting');
    } else {
      setRosterSettings(prev => ({ ...prev, [userId]: { permanentOffDays } }));
    }
  };

  const handleOffDayToggle = (userId: string, dayIndex: number) => {
    const current = rosterSettings[userId] || { permanentOffDays: [] };
    const newDays = current.permanentOffDays.includes(dayIndex)
      ? current.permanentOffDays.filter(d => d !== dayIndex)
      : [...current.permanentOffDays, dayIndex];
    saveOffDaySetting(userId, newDays);
  };

  // ─── Auto-load saved roster on month change ───
  useEffect(() => {
    const loadSaved = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('saved_rosters')
        .select('*')
        .eq('roster_type', 'doctor')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle();
      if (data) {
        setRoster(data.roster_data as unknown as DoctorRosterData);
        setOriginalRoster(data.roster_data as unknown as DoctorRosterData);
        if (data.staff_list && (data.staff_list as unknown as StaffMember[]).length > 0) {
          setStaffList(data.staff_list as unknown as StaffMember[]);
        }
        setWarnings((data.warnings as unknown as string[]) || []);
        setManualOverrides({});
        setSavedAt(data.updated_at);
        toast.info('Saved roster loaded');
      } else {
        setSavedAt(null);
      }
      setLoading(false);
    };
    loadSaved();
  }, [selectedMonth, selectedYear]);

  const saveRoster = async () => {
    if (!roster) { toast.error('No roster to save'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Please sign in to save'); setSaving(false); return; }

    const payload = {
      roster_type: 'doctor' as string,
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

  // Staff management
  const addStaff = () => {
    if (!newStaffName.trim()) return;
    setStaffList(prev => [...prev, { id: crypto.randomUUID(), name: newStaffName.trim(), position: 'Doctor' }]);
    setNewStaffName('');
  };
  const removeStaff = (id: string) => setStaffList(prev => prev.filter(s => s.id !== id));
  const startEdit = (s: StaffMember) => { setEditingId(s.id); setEditName(s.name); };
  const saveEdit = () => {
    if (!editingId) return;
    setStaffList(prev => prev.map(s => s.id === editingId ? { ...s, name: editName.trim() || s.name } : s));
    setEditingId(null);
  };

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ─── Calculate hours from roster ───
  const calcWeekHoursFromRoster = (r: DoctorRosterData) => {
    const weekHrs: Record<string, Record<number, number>> = {};
    staffList.forEach(s => { weekHrs[s.id] = {}; });
    for (const day of monthDays) {
      const dk = format(day, 'yyyy-MM-dd');
      const w = getISOWeek(day);
      const d = r[dk];
      if (!d) continue;
      if (d.shift1 && weekHrs[d.shift1.staffId]) weekHrs[d.shift1.staffId][w] = (weekHrs[d.shift1.staffId][w] || 0) + SHIFT1_HOURS;
      if (d.shift2 && weekHrs[d.shift2.staffId]) weekHrs[d.shift2.staffId][w] = (weekHrs[d.shift2.staffId][w] || 0) + SHIFT2_HOURS;
      if (d.shift3 && weekHrs[d.shift3.staffId]) weekHrs[d.shift3.staffId][w] = (weekHrs[d.shift3.staffId][w] || 0) + SHIFT3_HOURS;
    }
    return weekHrs;
  };

  const calcMonthHoursFromRoster = (r: DoctorRosterData, staffId: string) => {
    let total = 0;
    for (const dk of Object.keys(r)) {
      const d = r[dk];
      if (d.shift1?.staffId === staffId) total += SHIFT1_HOURS;
      if (d.shift2?.staffId === staffId) total += SHIFT2_HOURS;
      if (d.shift3?.staffId === staffId) total += SHIFT3_HOURS;
    }
    return total;
  };

  // ─── Generator ───
  const generateRoster = () => {
    if (staffList.length === 0) { toast.error('Add at least one doctor first'); return; }
    if (staffList.length < 2) { toast.error('Need at least 2 doctors for valid roster'); return; }

    const newRoster: DoctorRosterData = {};
    const weekHours: Record<string, Record<number, number>> = {};
    staffList.forEach(s => { weekHours[s.id] = {}; });

    // Track consecutive working days
    const consecutiveDays: Record<string, number> = {};
    staffList.forEach(s => { consecutiveDays[s.id] = 0; });

    const getWH = (sid: string, w: number) => weekHours[sid]?.[w] || 0;
    const addWH = (sid: string, w: number, h: number) => {
      if (!weekHours[sid]) weekHours[sid] = {};
      weekHours[sid][w] = (weekHours[sid][w] || 0) + h;
    };
    const getMonthH = (sid: string) => {
      let t = 0; for (const v of Object.values(weekHours[sid] || {})) t += v; return t;
    };

    // Check permanent off day
    const isOffDay = (staffId: string, dayOfWeek: number) => {
      const setting = rosterSettings[staffId];
      return setting?.permanentOffDays?.includes(dayOfWeek) || false;
    };

    // Check consecutive day limit
    const mustRest = (staffId: string) => {
      return (consecutiveDays[staffId] || 0) >= MAX_CONSECUTIVE_DAYS;
    };

    const newWarnings: string[] = [];

    const weightedPick = (pool: StaffMember[]): StaffMember => {
      if (pool.length === 1) return pool[0];
      const mh = pool.map(s => getMonthH(s.id));
      const maxH = Math.max(...mh, 1);
      const weights = pool.map((_, i) => maxH - mh[i] + 1);
      const totalW = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalW;
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    };

    // Sort days chronologically for consecutive tracking
    const sortedDays = [...monthDays].sort((a, b) => a.getTime() - b.getTime());

    for (const day of sortedDays) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const isoWeek = getISOWeek(day);
      const dayOfWeek = getDay(day);
      const assignedToday = new Set<string>();

      // ─── Assign daytime block (S1+S2 = same doctor) ───
      let daytimeDoc: RosterCell | null = null;
      {
        let eligible = staffList.filter(s =>
          !assignedToday.has(s.id) &&
          !isOffDay(s.id, dayOfWeek) &&
          !mustRest(s.id)
        );
        if (ruleMinHours) {
          const under = eligible.filter(s => getWH(s.id, isoWeek) + DAYTIME_HOURS <= WEEKLY_MAX);
          if (under.length > 0) eligible = under;
        }
        // Fallback: relax consecutive
        if (eligible.length === 0) {
          eligible = staffList.filter(s => !assignedToday.has(s.id) && !isOffDay(s.id, dayOfWeek));
        }
        if (eligible.length === 0) eligible = staffList.filter(s => !assignedToday.has(s.id));
        if (eligible.length === 0) eligible = [...staffList];

        if (ruleFairDist) {
          const below45 = eligible.filter(s => getWH(s.id, isoWeek) < WEEKLY_MIN);
          const pool = below45.length > 0 ? below45 : eligible;
          const pick = weightedPick(pool);
          daytimeDoc = { staffId: pick.id, staffName: pick.name };
        } else {
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          daytimeDoc = { staffId: pick.id, staffName: pick.name };
        }

        if (daytimeDoc) {
          assignedToday.add(daytimeDoc.staffId);
          addWH(daytimeDoc.staffId, isoWeek, DAYTIME_HOURS);
          if (getWH(daytimeDoc.staffId, isoWeek) > WEEKLY_MAX) {
            newWarnings.push(`${format(day, 'dd MMM')}: ${firstName(daytimeDoc.staffName)} daytime block exceeds ${WEEKLY_MAX}h in week ${isoWeek} (OT)`);
          }
        }
      }

      // ─── Assign night shift (S3 = different doctor) ───
      let nightDoc: RosterCell | null = null;
      {
        let eligible = staffList.filter(s =>
          !assignedToday.has(s.id) &&
          !isOffDay(s.id, dayOfWeek) &&
          !mustRest(s.id)
        );
        if (ruleMinHours) {
          const under = eligible.filter(s => getWH(s.id, isoWeek) + SHIFT3_HOURS <= WEEKLY_MAX);
          if (under.length > 0) eligible = under;
        }
        // Fallback: relax consecutive
        if (eligible.length === 0) {
          eligible = staffList.filter(s => !assignedToday.has(s.id) && !isOffDay(s.id, dayOfWeek));
        }
        if (eligible.length === 0) eligible = staffList.filter(s => !assignedToday.has(s.id));
        if (eligible.length === 0) {
          eligible = staffList.filter(s => s.id !== daytimeDoc?.staffId);
          if (eligible.length === 0) eligible = [...staffList];
          newWarnings.push(`${format(day, 'dd MMM')}: Night shift forced — no ideal candidate`);
        }

        if (ruleFairDist) {
          const below45 = eligible.filter(s => getWH(s.id, isoWeek) < WEEKLY_MIN);
          const pool = below45.length > 0 ? below45 : eligible;
          nightDoc = (() => { const p = weightedPick(pool); return { staffId: p.id, staffName: p.name }; })();
        } else {
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          nightDoc = { staffId: pick.id, staffName: pick.name };
        }

        if (nightDoc) {
          assignedToday.add(nightDoc.staffId);
          addWH(nightDoc.staffId, isoWeek, SHIFT3_HOURS);
        }
      }

      newRoster[dateKey] = {
        shift1: daytimeDoc,
        shift2: daytimeDoc, // same doctor for S1+S2
        shift3: nightDoc,
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

    // ─── Top-up pass: enforce 45h minimum per week ───
    if (ruleMinHours) {
      // Recalculate week hours from roster
      staffList.forEach(s => { weekHours[s.id] = {}; });
      for (const day of monthDays) {
        const dk = format(day, 'yyyy-MM-dd');
        const w = getISOWeek(day);
        const d = newRoster[dk];
        if (d.shift1) addWH(d.shift1.staffId, w, SHIFT1_HOURS);
        if (d.shift2) addWH(d.shift2.staffId, w, SHIFT2_HOURS);
        if (d.shift3) addWH(d.shift3.staffId, w, SHIFT3_HOURS);
      }

      const allWeeks = new Set<number>();
      const weekDaysMap: Record<number, Date[]> = {};
      monthDays.forEach(d => {
        const w = getISOWeek(d);
        allWeeks.add(w);
        if (!weekDaysMap[w]) weekDaysMap[w] = [];
        weekDaysMap[w].push(d);
      });

      // Try to swap night shifts to boost under-45h doctors
      let changed = true;
      let iter = 0;
      while (changed && iter < 200) {
        changed = false;
        iter++;
        for (const week of allWeeks) {
          const days = weekDaysMap[week] || [];
          const underStaff = staffList.filter(s => {
            const h = getWH(s.id, week);
            return h > 0 && h < WEEKLY_MIN;
          }).sort((a, b) => getWH(a.id, week) - getWH(b.id, week));

          for (const under of underStaff) {
            if (getWH(under.id, week) >= WEEKLY_MIN) continue;
            for (const day of days) {
              if (getWH(under.id, week) >= WEEKLY_MIN) break;
              const dk = format(day, 'yyyy-MM-dd');
              const d = newRoster[dk];

              const todayIds = [d.shift1?.staffId, d.shift2?.staffId, d.shift3?.staffId].filter(Boolean);
              if (todayIds.includes(under.id)) continue;

              // Try swapping night shift
              if (d.shift3) {
                const donor = d.shift3;
                const donorH = getWH(donor.staffId, week);
                const underH = getWH(under.id, week);
                if (donorH > underH + SHIFT3_HOURS && (donorH - SHIFT3_HOURS >= WEEKLY_MIN || donorH - SHIFT3_HOURS >= underH)) {
                  if (d.shift1?.staffId !== under.id && d.shift2?.staffId !== under.id) {
                    weekHours[donor.staffId][week] -= SHIFT3_HOURS;
                    weekHours[under.id][week] = (weekHours[under.id][week] || 0) + SHIFT3_HOURS;
                    newRoster[dk] = { ...d, shift3: { staffId: under.id, staffName: under.name } };
                    changed = true;
                  }
                }
              }

              // Try swapping daytime block
              if (getWH(under.id, week) >= WEEKLY_MIN) break;
              if (d.shift1 && d.shift2 && d.shift1.staffId === d.shift2.staffId) {
                const donor = d.shift1;
                const donorH = getWH(donor.staffId, week);
                const underH = getWH(under.id, week);
                if (donorH > underH + DAYTIME_HOURS && (donorH - DAYTIME_HOURS >= WEEKLY_MIN || donorH - DAYTIME_HOURS >= underH)) {
                  if (d.shift3?.staffId !== under.id) {
                    weekHours[donor.staffId][week] -= DAYTIME_HOURS;
                    weekHours[under.id][week] = (weekHours[under.id][week] || 0) + DAYTIME_HOURS;
                    const cell: RosterCell = { staffId: under.id, staffName: under.name };
                    newRoster[dk] = { ...d, shift1: cell, shift2: cell };
                    changed = true;
                  }
                }
              }
            }
          }
        }
      }

      // Warn about remaining below-45h
      staffList.forEach(s => {
        allWeeks.forEach(week => {
          const hrs = getWH(s.id, week);
          if (hrs > 0 && hrs < WEEKLY_MIN) {
            const daysInWeek = weekDaysMap[week]?.length || 0;
            if (daysInWeek < 7) {
              newWarnings.push(`${firstName(s.name)}: ${hrs}h in week ${week} (partial week — ${daysInWeek} days)`);
            } else {
              newWarnings.push(`${firstName(s.name)}: Only ${hrs}h in week ${week} (below ${WEEKLY_MIN}h minimum)`);
            }
          }
        });
      });
    }

    // ─── Global balance pass ───
    if (ruleFairDist) {
      let balanceIter = 0;
      let improved = true;
      while (improved && balanceIter < 300) {
        improved = false;
        balanceIter++;
        const mh = staffList.map(s => ({ id: s.id, name: s.name, hours: calcMonthHoursFromRoster(newRoster, s.id) }));
        mh.sort((a, b) => b.hours - a.hours);
        const hi = mh[0];
        const lo = mh[mh.length - 1];
        if (hi.hours - lo.hours <= SHIFT3_HOURS) break;

        for (const day of monthDays) {
          const dk = format(day, 'yyyy-MM-dd');
          const d = newRoster[dk];

          // Try swapping night shift
          if (d.shift3?.staffId === hi.id) {
            const todayIds = [d.shift1?.staffId, d.shift2?.staffId];
            if (!todayIds.includes(lo.id)) {
              newRoster[dk] = { ...d, shift3: { staffId: lo.id, staffName: staffList.find(s => s.id === lo.id)!.name } };
              improved = true;
              break;
            }
          }

          // Try swapping daytime block
          if (d.shift1?.staffId === hi.id && d.shift2?.staffId === hi.id) {
            if (d.shift3?.staffId !== lo.id) {
              const cell: RosterCell = { staffId: lo.id, staffName: staffList.find(s => s.id === lo.id)!.name };
              newRoster[dk] = { ...d, shift1: cell, shift2: cell };
              improved = true;
              break;
            }
          }
        }
      }
    }

    setRoster(newRoster);
    setOriginalRoster(JSON.parse(JSON.stringify(newRoster)));
    setManualOverrides({});
    setWarnings(newWarnings);
    if (newWarnings.length === 0) toast.success('Roster generated successfully!');
    else toast.warning(`Roster generated with ${newWarnings.length} warning(s)`);
  };

  const clearRoster = () => { setRoster(null); setOriginalRoster(null); setManualOverrides({}); setWarnings([]); };

  const resetManualChanges = () => {
    if (originalRoster) {
      setRoster(JSON.parse(JSON.stringify(originalRoster)));
      setManualOverrides({});
      toast.success('Manual changes reset');
    }
  };

  const autoFillEmpty = () => {
    if (!roster) return;
    const updated = { ...roster };
    let filled = 0;
    for (const day of monthDays) {
      const dk = format(day, 'yyyy-MM-dd');
      const d = { ...updated[dk] };
      if (!d.shift1 || !d.shift2) {
        const eligible = staffList.filter(s => s.id !== d.shift3?.staffId);
        if (eligible.length > 0) {
          const sorted = eligible.sort((a, b) => calcMonthHoursFromRoster(updated, a.id) - calcMonthHoursFromRoster(updated, b.id));
          const cell: RosterCell = { staffId: sorted[0].id, staffName: sorted[0].name };
          if (!d.shift1) { d.shift1 = cell; filled++; }
          if (!d.shift2) { d.shift2 = cell; filled++; }
        }
      }
      if (!d.shift3) {
        const eligible = staffList.filter(s => s.id !== d.shift1?.staffId && s.id !== d.shift2?.staffId);
        if (eligible.length > 0) {
          const sorted = eligible.sort((a, b) => calcMonthHoursFromRoster(updated, a.id) - calcMonthHoursFromRoster(updated, b.id));
          d.shift3 = { staffId: sorted[0].id, staffName: sorted[0].name };
          filled++;
        }
      }
      updated[dk] = d;
    }
    setRoster(updated);
    toast.success(`Filled ${filled} empty slot(s)`);
  };

  // ─── Manual cell change ───
  const updateCell = (dateKey: string, shift: 'shift1' | 'shift2' | 'shift3', newStaffId: string) => {
    if (!roster) return;
    const staff = staffList.find(s => s.id === newStaffId);
    if (!staff) return;

    const dayData = roster[dateKey];
    const cell: RosterCell = { staffId: staff.id, staffName: staff.name };

    if (ruleValidCombos) {
      if (shift === 'shift1' || shift === 'shift2') {
        if (dayData.shift3?.staffId === newStaffId) {
          toast.warning(`${firstName(staff.name)} is on night shift — invalid combo. Assigning anyway (override).`);
        }
      }
      if (shift === 'shift3') {
        if (dayData.shift1?.staffId === newStaffId || dayData.shift2?.staffId === newStaffId) {
          toast.warning(`${firstName(staff.name)} is on daytime — invalid combo. Assigning anyway (override).`);
        }
      }
    }

    setRoster(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const dd = { ...updated[dateKey] };

      if (shift === 'shift1') {
        dd.shift1 = cell;
        if (ruleValidCombos) dd.shift2 = cell;
      } else if (shift === 'shift2') {
        dd.shift2 = cell;
        if (ruleValidCombos) dd.shift1 = cell;
      } else {
        dd.shift3 = cell;
      }
      updated[dateKey] = dd;
      return updated;
    });

    setManualOverrides(prev => {
      const updated = { ...prev };
      if (!updated[dateKey]) updated[dateKey] = new Set();
      const s = new Set(updated[dateKey]);
      s.add(shift);
      if ((shift === 'shift1' || shift === 'shift2') && ruleValidCombos) {
        s.add('shift1');
        s.add('shift2');
      }
      updated[dateKey] = s;
      return updated;
    });
  };

  // ─── Summary calculations ───
  const summary: DoctorSummary[] = useMemo(() => {
    if (!roster) return [];

    const allWeeks = new Set<number>();
    monthDays.forEach(d => allWeeks.add(getISOWeek(d)));

    const weekHrs = calcWeekHoursFromRoster(roster);
    const results: DoctorSummary[] = staffList.map(s => {
      const wr: Record<number, number> = {};
      const wo: Record<number, number> = {};
      let totalReg = 0, totalOT = 0, dayBlocks = 0, nights = 0;

      allWeeks.forEach(w => {
        const h = weekHrs[s.id]?.[w] || 0;
        const reg = Math.min(h, WEEKLY_MIN);
        const ot = Math.max(h - WEEKLY_MIN, 0);
        wr[w] = reg;
        wo[w] = ot;
        totalReg += reg;
        totalOT += ot;
      });

      for (const dk of Object.keys(roster)) {
        const d = roster[dk];
        if (d.shift1?.staffId === s.id && d.shift2?.staffId === s.id) dayBlocks++;
        if (d.shift3?.staffId === s.id) nights++;
      }

      return {
        id: s.id,
        name: s.name,
        weeklyRegular: wr,
        weeklyOvertime: wo,
        totalRegular: totalReg,
        totalOvertime: totalOT,
        totalHours: totalReg + totalOT,
        daytimeBlocks: dayBlocks,
        nightShifts: nights,
        diffFromAvg: 0,
      };
    });

    const avg = results.length > 0 ? results.reduce((a, r) => a + r.totalHours, 0) / results.length : 0;
    results.forEach(r => { r.diffFromAvg = Math.round(r.totalHours - avg); });

    return results;
  }, [roster, staffList, monthDays]);

  const fairnessMetrics = useMemo(() => {
    if (summary.length === 0) return null;
    const hours = summary.map(s => s.totalHours);
    const maxH = Math.max(...hours);
    const minH = Math.min(...hours);
    const spread = maxH - minH;
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const score = avg > 0 ? Math.max(0, Math.min(100, Math.round(100 - (spread / avg) * 100))) : 100;
    const totalOT = summary.reduce((a, s) => a + s.totalOvertime, 0);
    return { maxH, minH, spread, avg: Math.round(avg), score, totalOT };
  }, [summary]);

  const monthLabel = format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');

  const allWeeksSorted = useMemo(() => {
    const ws = new Set<number>();
    monthDays.forEach(d => ws.add(getISOWeek(d)));
    return Array.from(ws).sort((a, b) => a - b);
  }, [monthDays]);

  // ─── CSV Export ───
  const exportCSV = () => {
    if (!roster) return;
    const rows: string[] = [];
    rows.push(`Doctor Roster — ${monthLabel}`);
    rows.push(['Shift', ...monthDays.map(d => format(d, 'dd'))].join(','));

    const s1Row = ['Shift 1 (8am-2pm)'];
    const s2Row = ['Shift 2 (2pm-8pm)'];
    const s3Row = ['Shift 3 (8pm-12am)'];
    for (const day of monthDays) {
      const dk = format(day, 'yyyy-MM-dd');
      const d = roster[dk];
      s1Row.push(d?.shift1 ? firstName(d.shift1.staffName) : '');
      s2Row.push(d?.shift2 ? firstName(d.shift2.staffName) : '');
      s3Row.push(d?.shift3 ? firstName(d.shift3.staffName) : '');
    }
    rows.push(s1Row.join(','));
    rows.push(s2Row.join(','));
    rows.push(s3Row.join(','));
    rows.push('');
    rows.push('Doctor,Regular Hours,Overtime Hours,Total Hours,Daytime Blocks,Night Shifts,Diff from Avg');
    summary.forEach(s => {
      rows.push(`${s.name},${s.totalRegular},${s.totalOvertime},${s.totalHours},${s.daytimeBlocks},${s.nightShifts},${s.diffFromAvg > 0 ? '+' : ''}${s.diffFromAvg}`);
    });
    if (fairnessMetrics) {
      rows.push('');
      rows.push(`Fairness Score,${fairnessMetrics.score}%`);
      rows.push(`Hour Spread,${fairnessMetrics.spread}h (${fairnessMetrics.maxH}h - ${fairnessMetrics.minH}h)`);
      rows.push(`Average Hours,${fairnessMetrics.avg}h`);
      rows.push(`Total Overtime,${fairnessMetrics.totalOT}h`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor-roster-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const isManualOverride = (dateKey: string, shift: 'shift1' | 'shift2' | 'shift3') => {
    return manualOverrides[dateKey]?.has(shift) || false;
  };

  const hasManualChanges = Object.keys(manualOverrides).length > 0;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Doctor List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Doctors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Doctor name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="flex-1" onKeyDown={e => e.key === 'Enter' && addStaff()} />
              <Button size="icon" onClick={addStaff}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {staffList.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
                  {editingId === s.id ? (
                    <>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs flex-1" onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={saveEdit}>Save</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium cursor-pointer" onClick={() => startEdit(s)}>{s.name}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeStaff(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {staffList.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No doctors added yet.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox id="rule-max-shifts" checked={ruleMaxShifts} onCheckedChange={v => setRuleMaxShifts(!!v)} />
              <div>
                <Label htmlFor="rule-max-shifts" className="text-sm font-medium">Max 2 shifts per day</Label>
                <p className="text-xs text-muted-foreground">Doctor works either daytime block (S1+S2) or night (S3)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="rule-combos" checked={ruleValidCombos} onCheckedChange={v => setRuleValidCombos(!!v)} />
              <div>
                <Label htmlFor="rule-combos" className="text-sm font-medium">Valid shift combinations only</Label>
                <p className="text-xs text-muted-foreground">S1+S2 together (12h) or S3 alone (4h). No S1+S3 or S2+S3</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="rule-min-hrs" checked={ruleMinHours} onCheckedChange={v => setRuleMinHours(!!v)} />
              <div>
                <Label htmlFor="rule-min-hrs" className="text-sm font-medium">45h/week target (OT beyond)</Label>
                <p className="text-xs text-muted-foreground">Normal ≤ 45h/week. Hours beyond are overtime. Max 6 consecutive working days.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="rule-overtime" checked={ruleOvertime} onCheckedChange={v => setRuleOvertime(!!v)} />
              <div>
                <Label htmlFor="rule-overtime" className="text-sm font-medium">Overtime calculation (&gt;45h/week)</Label>
                <p className="text-xs text-muted-foreground">Hours above 45 per week are tracked as overtime</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="rule-fair" checked={ruleFairDist} onCheckedChange={v => setRuleFairDist(!!v)} />
              <div>
                <Label htmlFor="rule-fair" className="text-sm font-medium">Fair distribution</Label>
                <p className="text-xs text-muted-foreground">Weighted assignment prioritising doctors with fewer hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permanent Off Days Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Permanent Off Days</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">Select permanent weekly off days for each doctor. These settings are saved automatically.</p>
          {staffList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Add doctors first</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    {DAY_ABBR.map((d, i) => <TableHead key={i} className="text-center text-xs w-12">{d}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.map(s => {
                    const setting = rosterSettings[s.id] || { permanentOffDays: [] };
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">{firstName(s.name)}</TableCell>
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

      {/* Roster */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2"><Shuffle className="h-5 w-5" /> Doctor Roster</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-center cursor-default">
                  <CalendarDays className="h-4 w-4" />{monthLabel}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
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
                    {/* Week row */}
                    <TableRow>
                      <TableHead className="w-32 sticky left-0 bg-background z-10 text-center text-xs font-semibold">Week</TableHead>
                      {(() => {
                        const groups: { week: number; span: number }[] = [];
                        monthDays.forEach(day => {
                          const w = getISOWeek(day);
                          if (groups.length > 0 && groups[groups.length - 1].week === w) groups[groups.length - 1].span++;
                          else groups.push({ week: w, span: 1 });
                        });
                        return groups.map((g, i) => (
                          <TableHead key={g.week} colSpan={g.span} className={cn("text-center text-xs font-semibold border-x", i % 2 === 0 ? "bg-primary/10" : "bg-accent/30")}>
                            Week {g.week}
                          </TableHead>
                        ));
                      })()}
                    </TableRow>
                    {/* Day headers */}
                    <TableRow>
                      <TableHead className="w-32 font-semibold sticky left-0 bg-background z-10">Shift</TableHead>
                      {monthDays.map(day => (
                        <TableHead key={day.toISOString()} className={cn("text-center min-w-[80px]", isWeekend(day) && "bg-muted/30")}>
                          <div className="font-semibold text-xs">{DAY_ABBR[getDay(day)]}</div>
                          <div className="text-xs text-muted-foreground font-normal">{format(day, 'd')}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Shift 1 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 1</div>
                        <div className="text-[10px] text-muted-foreground">8am–2pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const d = roster[dk];
                        const cell = d?.shift1;
                        const isSameAsS2 = cell && d?.shift2 && cell.staffId === d.shift2.staffId;
                        const isOverride = isManualOverride(dk, 'shift1');
                        return (
                          <TableCell key={dk} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20", isSameAsS2 && "bg-primary/5", isOverride && "ring-2 ring-inset ring-orange-400")}>
                            {cell ? (
                              <Select value={cell.staffId} onValueChange={v => updateCell(dk, 'shift1', v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Shift 2 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 2</div>
                        <div className="text-[10px] text-muted-foreground">2pm–8pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const d = roster[dk];
                        const cell = d?.shift2;
                        const isSameAsS1 = cell && d?.shift1 && cell.staffId === d.shift1.staffId;
                        const isOverride = isManualOverride(dk, 'shift2');
                        return (
                          <TableCell key={dk} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20", isSameAsS1 && "bg-primary/5", isOverride && "ring-2 ring-inset ring-orange-400")}>
                            {cell ? (
                              <Select value={cell.staffId} onValueChange={v => updateCell(dk, 'shift2', v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Shift 3 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 3</div>
                        <div className="text-[10px] text-muted-foreground">8pm–12am</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const d = roster[dk];
                        const cell = d?.shift3;
                        const isOverride = isManualOverride(dk, 'shift3');
                        return (
                          <TableCell key={dk} className={cn("text-center p-1", isWeekend(day) && "bg-muted/20", isOverride && "ring-2 ring-inset ring-orange-400")}>
                            {cell ? (
                              <Select value={cell.staffId} onValueChange={v => updateCell(dk, 'shift3', v)}>
                                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent shadow-none px-1 justify-center min-w-[60px]">
                                  <span className="truncate">{firstName(cell.staffName)}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Off row */}
                    <TableRow>
                      <TableCell className="font-medium bg-destructive/10 sticky left-0 z-10">
                        <div className="text-xs">Off</div>
                        <div className="text-[10px] text-muted-foreground">Not assigned</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const d = roster[dk];
                        const assignedIds = new Set<string>();
                        if (d) {
                          if (d.shift1) assignedIds.add(d.shift1.staffId);
                          if (d.shift2) assignedIds.add(d.shift2.staffId);
                          if (d.shift3) assignedIds.add(d.shift3.staffId);
                        }
                        const offStaff = staffList.filter(s => !assignedIds.has(s.id));
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[10px] text-muted-foreground", isWeekend(day) && "bg-muted/20")}>
                            {offStaff.length > 0 ? offStaff.map(s => firstName(s.name)).join(', ') : '—'}
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doctor</TableHead>
                        {allWeeksSorted.map(w => (
                          <TableHead key={w} className="text-center text-xs">Wk {w}<br /><span className="text-muted-foreground font-normal">Reg / OT</span></TableHead>
                        ))}
                        <TableHead className="text-center">Regular</TableHead>
                        <TableHead className="text-center">Overtime</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Day Blocks</TableHead>
                        <TableHead className="text-center">Night Shifts</TableHead>
                        <TableHead className="text-center">Diff</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          {allWeeksSorted.map(w => (
                            <TableCell key={w} className="text-center text-xs">
                              {s.weeklyRegular[w] || 0}h{ruleOvertime && s.weeklyOvertime[w] ? <span className="text-destructive"> +{s.weeklyOvertime[w]}h</span> : ''}
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-medium">{s.totalRegular}h</TableCell>
                          <TableCell className="text-center">
                            {s.totalOvertime > 0 ? <Badge variant="destructive" className="text-xs">{s.totalOvertime}h</Badge> : <span className="text-muted-foreground">0h</span>}
                          </TableCell>
                          <TableCell className="text-center font-semibold">{s.totalHours}h</TableCell>
                          <TableCell className="text-center">{s.daytimeBlocks}</TableCell>
                          <TableCell className="text-center">{s.nightShifts}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn("text-xs", s.diffFromAvg > 0 ? "text-destructive" : s.diffFromAvg < 0 ? "text-blue-600" : "text-muted-foreground")}>
                              {s.diffFromAvg > 0 ? '+' : ''}{s.diffFromAvg}h
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Fairness */}
                {fairnessMetrics && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Fairness:</span>
                    <Badge
                      variant={fairnessMetrics.score >= 90 ? 'secondary' : 'destructive'}
                      className={cn("text-xs",
                        fairnessMetrics.score >= 90 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                        fairnessMetrics.score >= 70 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : ""
                      )}
                    >
                      {fairnessMetrics.score}% balanced
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Spread: {fairnessMetrics.maxH}h − {fairnessMetrics.minH}h = {fairnessMetrics.spread}h · Avg: {fairnessMetrics.avg}h · Total OT: {fairnessMetrics.totalOT}h
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap print:hidden items-center">
                <Button onClick={saveRoster} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Roster'}</Button>
                <Button variant="outline" onClick={generateRoster} className="gap-2"><RefreshCw className="h-4 w-4" /> Generate Again</Button>
                <Button variant="outline" onClick={clearRoster} className="gap-2"><X className="h-4 w-4" /> Clear</Button>
                {hasManualChanges && (
                  <Button variant="outline" onClick={resetManualChanges} className="gap-2"><Eraser className="h-4 w-4" /> Reset Manual Changes</Button>
                )}
                <Button variant="outline" onClick={autoFillEmpty} className="gap-2"><Zap className="h-4 w-4" /> Auto-fill Empty</Button>
                <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> Export CSV</Button>
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
                {savedAt && <span className="text-xs text-muted-foreground ml-2">Last saved: {format(new Date(savedAt), 'dd MMM yyyy, HH:mm')}</span>}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Shuffle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a month and click "Generate" to create a doctor roster</p>
              <p className="text-xs mt-1">3 shifts per day · S1+S2 daytime block (12h) · S3 night (4h)</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
