import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Shield, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth, type AppRole } from '@/contexts/AuthContext';

const STAFF_POSITIONS = ['Clinic Assistant', 'Staff Nurse', 'Medical Assistant', 'Doctor', 'Manager', 'Purchaser', 'Housecall Nurse'];

interface Employee {
  id: string;
  full_name: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  created_at: string;
  role: 'admin' | 'staff' | 'guest';
}

export default function AdminEmployees() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    setIsLoading(true);
    const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, phone, department, position, created_at').order('full_name');
    if (error) { toast({ title: 'Error', description: 'Failed to load employees', variant: 'destructive' }); setIsLoading(false); return; }
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const roleMap: Record<string, AppRole> = {};
    roles?.forEach((r) => { roleMap[r.user_id] = r.role as AppRole; });
    setEmployees((profiles || []).map((p: any) => ({ ...p, role: roleMap[p.id] || 'staff' })));
    setIsLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    const { error } = await supabase.rpc('admin_assign_role', {
      target_user_id: userId,
      new_role: newRole,
    });
    if (error) {
      const msg = error.message || '';
      if (error.code === '42501' || msg.includes('NOT_AUTHORIZED')) {
        toast({ title: 'Not allowed', description: 'You do not have permission to change roles', variant: 'destructive' });
      } else if (msg.includes('CANNOT_DEMOTE_SELF')) {
        toast({ title: 'Not allowed', description: 'You cannot demote your own admin account. Ask another admin.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Failed to update role', variant: 'destructive' });
      }
      return;
    }
    toast({ title: 'Role Updated', description: `User role changed to ${newRole}` });
    fetchEmployees();
  };

  const handlePositionChange = async (userId: string, newPosition: string) => {
    const position = newPosition === '__none__' ? null : newPosition;
    const { error } = await supabase.from('profiles').update({ position }).eq('id', userId);
    if (error) { toast({ title: 'Error', description: 'Failed to update position', variant: 'destructive' }); return; }
    toast({ title: 'Position Updated', description: `Position changed to ${position || 'None'}` });
    fetchEmployees();
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Employees</h1><p className="text-muted-foreground">Manage staff members and their roles</p></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Staff Directory</CardTitle><CardDescription>{employees.length} employees registered</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : employees.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Users className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No employees found.</p></div>
          : (
            <div className="space-y-4">{employees.map((e) => (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">{e.role === 'admin' ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}</div>
                  <div><p className="font-medium">{e.full_name || 'Unknown'}</p>{e.position && <p className="text-sm text-foreground/80">{e.position}</p>}<p className="text-sm text-muted-foreground">{e.department || 'No department'}{e.phone && ` • ${e.phone}`}</p></div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={e.position || '__none__'} onValueChange={(v) => handlePositionChange(e.id, v)}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Set position" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No position</SelectItem>
                      {STAFF_POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Badge variant={e.role === 'admin' ? 'default' : 'secondary'}>{e.role}</Badge>
                  <Select value={e.role} onValueChange={(v: AppRole) => handleRoleChange(e.id, v)}>
                     <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="guest" disabled={e.id === user?.id && e.role === 'admin'}>Guest</SelectItem>
                       <SelectItem value="staff" disabled={e.id === user?.id && e.role === 'admin'}>Staff</SelectItem>
                       <SelectItem value="locum">Locum Doctor</SelectItem>
                       <SelectItem value="operations">Operations</SelectItem>
                       <SelectItem value="doctor_admin">Doctor Admin</SelectItem>
                       <SelectItem value="admin">Admin</SelectItem>
                     </SelectContent>
                  </Select>
                </div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
