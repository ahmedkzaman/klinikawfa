import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getISOWeek, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';

interface StaffMember { id: string; name: string; position: string; }
interface RosterCell { staffId: string; staffName: string; }
interface DoctorDayRoster {
  shift1?: RosterCell | null; shift2?: RosterCell | null; shift3?: RosterCell | null;
  DOC_S1?: RosterCell | null; DOC_S2?: RosterCell | null; DOC_S3?: RosterCell | null;
  [k: string]: RosterCell | null | undefined;
}
interface DoctorRosterData { [dateKey: string]: DoctorDayRoster; }

// Normalise a stored day to the 3 logical doctor slots, accepting both legacy and new keys.
function getSlot(day: DoctorDayRoster | undefined, n: 1 | 2 | 3): RosterCell | null {
  if (!day) return null;
  const legacy = day[`shift${n}` as 'shift1' | 'shift2' | 'shift3'];
  const next = day[`DOC_S${n}` as 'DOC_S1' | 'DOC_S2' | 'DOC_S3'];
  return (next ?? legacy) ?? null;
}

const SHIFT1_HOURS = 5;
const SHIFT2_HOURS = 5;
const SHIFT3_HOURS = 4;
const WEEKLY_MIN = 45;
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function firstName(name: string) { return name.split(' ')[0]; }

export default function DrRosterView() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [roster, setRoster] = useState<DoctorRosterData | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const monthDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    return eachDayOfInterval({ start, end: endOfMonth(start) });
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('saved_rosters')
        .select('*')
        .eq('roster_type', 'doctor')
        .eq('month', selectedMonth + 1)
        .eq('year', selectedYear)
        .maybeSingle();
      if (data) {
        setRoster(data.roster_data as unknown as DoctorRosterData);
        setStaffList((data.staff_list as unknown as StaffMember[]) || []);
        setSavedAt(data.updated_at);
      } else {
        setRoster(null);
        setStaffList([]);
        setSavedAt(null);
      }
      setLoading(false);
    };
    load();
  }, [selectedMonth, selectedYear]);

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const allWeeksSorted = useMemo(() => {
    const ws = new Set<number>();
    monthDays.forEach(d => ws.add(getISOWeek(d)));
    return Array.from(ws).sort((a, b) => a - b);
  }, [monthDays]);

  const summary = useMemo(() => {
    if (!roster || staffList.length === 0) return [];
    const weekHrs: Record<string, Record<number, number>> = {};
    staffList.forEach(s => { weekHrs[s.id] = {}; });
    for (const day of monthDays) {
      const dk = format(day, 'yyyy-MM-dd');
      const w = getISOWeek(day);
      const d = roster[dk];
      if (!d) continue;
      const s1 = getSlot(d, 1), s2 = getSlot(d, 2), s3 = getSlot(d, 3);
      if (s1 && weekHrs[s1.staffId]) weekHrs[s1.staffId][w] = (weekHrs[s1.staffId][w] || 0) + SHIFT1_HOURS;
      if (s2 && weekHrs[s2.staffId]) weekHrs[s2.staffId][w] = (weekHrs[s2.staffId][w] || 0) + SHIFT2_HOURS;
      if (s3 && weekHrs[s3.staffId]) weekHrs[s3.staffId][w] = (weekHrs[s3.staffId][w] || 0) + SHIFT3_HOURS;
    }

    return staffList.map(s => {
      let totalReg = 0, totalOT = 0, dayBlocks = 0, nights = 0;
      const wr: Record<number, number> = {};
      const wo: Record<number, number> = {};
      allWeeksSorted.forEach(w => {
        const h = weekHrs[s.id]?.[w] || 0;
        const reg = Math.min(h, WEEKLY_MIN);
        const ot = Math.max(h - WEEKLY_MIN, 0);
        wr[w] = reg; wo[w] = ot;
        totalReg += reg; totalOT += ot;
      });
      for (const dk of Object.keys(roster)) {
        const d = roster[dk];
        const s1 = getSlot(d, 1), s2 = getSlot(d, 2), s3 = getSlot(d, 3);
        if (s1?.staffId === s.id && s2?.staffId === s.id) dayBlocks++;
        if (s3?.staffId === s.id) nights++;
      }
      const totalHours = totalReg + totalOT;
      return { id: s.id, name: s.name, weeklyRegular: wr, weeklyOvertime: wo, totalRegular: totalReg, totalOvertime: totalOT, totalHours, daytimeBlocks: dayBlocks, nightShifts: nights, diffFromAvg: 0 };
    }).map((r, _, arr) => {
      const avg = arr.reduce((a, x) => a + x.totalHours, 0) / arr.length;
      return { ...r, diffFromAvg: Math.round(r.totalHours - avg) };
    });
  }, [roster, staffList, monthDays, allWeeksSorted]);

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Doctor Roster</h1>
          <p className="text-sm text-muted-foreground">View the published monthly doctor roster</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">Roster — {monthLabel}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-center cursor-default">
                  <CalendarDays className="h-4 w-4" />{monthLabel}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          {savedAt && <p className="text-xs text-muted-foreground mt-1">Last updated: {format(new Date(savedAt), 'dd MMM yyyy, HH:mm')}</p>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : roster ? (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
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
                    <TableRow>
                      <TableHead className="w-32 font-semibold sticky left-0 bg-background z-10">Shift</TableHead>
                      {monthDays.map(day => (
                        <TableHead key={day.toISOString()} className={cn("text-center min-w-[70px]", isWeekend(day) && "bg-muted/30")}>
                          <div className="font-semibold text-xs">{DAY_ABBR[getDay(day)]}</div>
                          <div className="text-xs text-muted-foreground font-normal">{format(day, 'd')}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Doctor S1 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Doctor S1</div>
                        <div className="text-[10px] text-muted-foreground">8am – 1pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const cell = getSlot(roster[dk], 1);
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[11px]", isWeekend(day) && "bg-muted/20")}>
                            {cell ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                                {firstName(cell.staffName)}
                              </span>
                            ) : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Doctor S2 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Doctor S2</div>
                        <div className="text-[10px] text-muted-foreground">2pm – 7pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const cell = getSlot(roster[dk], 2);
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[11px]", isWeekend(day) && "bg-muted/20")}>
                            {cell ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                                {firstName(cell.staffName)}
                              </span>
                            ) : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Doctor S3 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Doctor S3</div>
                        <div className="text-[10px] text-muted-foreground">8pm – 12am</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const cell = getSlot(roster[dk], 3);
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[11px]", isWeekend(day) && "bg-muted/20")}>
                            {cell ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                                {firstName(cell.staffName)}
                              </span>
                            ) : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Off row */}
                    <TableRow>
                      <TableCell className="font-medium bg-destructive/10 sticky left-0 z-10">
                        <div className="text-xs">Off</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const d = roster[dk];
                        const assigned = new Set<string>();
                        const s1 = getSlot(d, 1), s2 = getSlot(d, 2), s3 = getSlot(d, 3);
                        if (s1) assigned.add(s1.staffId);
                        if (s2) assigned.add(s2.staffId);
                        if (s3) assigned.add(s3.staffId);
                        const off = staffList.filter(s => !assigned.has(s.id));
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[10px] text-muted-foreground", isWeekend(day) && "bg-muted/20")}>
                            {off.length > 0 ? off.map(s => firstName(s.name)).join(', ') : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              {summary.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Monthly Summary</h3>
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
                                {s.weeklyRegular[w] || 0}h{s.weeklyOvertime[w] ? <span className="text-destructive"> +{s.weeklyOvertime[w]}h</span> : ''}
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
              )}

              <div className="flex gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No roster has been published for {monthLabel} yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
