import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Search, AlertTriangle } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-blue-100 text-blue-800',
};

export default function PayrollSummary() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');

  const { data: summaries, isLoading } = useQuery({
    queryKey: ['payroll-summaries', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_payroll_summaries')
        .select('*')
        .eq('month', month)
        .eq('year', year);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, department, position');
      return data || [];
    },
  });

  const { data: payrollProfiles } = useQuery({
    queryKey: ['payroll-profiles-all'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_payroll_profiles').select('user_id, employment_type, payroll_status');
      return data || [];
    },
  });

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const payrollMap = Object.fromEntries((payrollProfiles || []).map(p => [p.user_id, p]));

  const enriched = (summaries || []).map(s => ({
    ...s,
    name: profileMap[s.user_id]?.full_name || 'Unknown',
    department: profileMap[s.user_id]?.department || '-',
    employment_type: payrollMap[s.user_id]?.employment_type || '-',
  }));

  const filtered = enriched.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.department.toLowerCase().includes(search.toLowerCase())
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Payroll Summary</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff or department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No payroll data for {MONTHS[month - 1]} {year}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Leave</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">Late</TableHead>
                    <TableHead className="text-center">OT Hrs</TableHead>
                    <TableHead className="text-center">Unpaid Leave</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Indicators</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.department}</TableCell>
                      <TableCell className="text-center">{s.total_present_days}</TableCell>
                      <TableCell className="text-center">{s.total_leave_days}</TableCell>
                      <TableCell className="text-center">{s.total_absent_days}</TableCell>
                      <TableCell className="text-center">{s.total_late_incidents}</TableCell>
                      <TableCell className="text-center">{s.total_overtime_hours}</TableCell>
                      <TableCell className="text-center">{s.unpaid_leave_count}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusColors[s.payroll_status] || ''}>
                          {s.payroll_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(s.unpaid_leave_count > 0 || s.total_absent_days > 0 || s.total_late_incidents > 0) && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
