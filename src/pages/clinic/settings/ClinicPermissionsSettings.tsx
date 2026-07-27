import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const ROLES: AppRole[] = ['admin','doctor_admin','resident_doctor','locum','ops_staff','staff'];
const PERMISSIONS = [
  ['access.manage_permissions','Manage permissions'], ['patients.view','View patients'], ['patients.edit','Edit patients'],
  ['queue.manage','Manage queue'], ['consultation.write','Write consultation'], ['billing.manage','Manage billing'],
  ['reports.view','View reports'], ['settings.manage','Manage clinic settings'],
] as const;
const labels: Record<string,string> = { admin:'Admin', doctor_admin:'Doctor Admin', resident_doctor:'Resident Doctor', locum:'Locum', ops_staff:'Operations Staff', staff:'Staff' };

export default function ClinicPermissionsSettings() {
  const { isAdmin, isDoctorAdmin } = useAuth();
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const canManage = isAdmin || isDoctorAdmin;
  useEffect(() => { if (!canManage) return; (async () => { const { data, error } = await supabase.rpc('get_clinic_permission_matrix'); if (error) toast.error(error.message); else setMatrix(Object.fromEntries((data ?? []).map((x: any) => [`${x.role}:${x.permission_key}`, x.allowed]))); setLoading(false); })(); }, [canManage]);
  const toggle = async (role: AppRole, key: string, allowed: boolean) => { setMatrix(m => ({...m, [`${role}:${key}`]: allowed})); const { error } = await supabase.rpc('set_clinic_permission', { _role: role, _permission_key: key, _allowed: allowed }); if (error) { setMatrix(m => ({...m, [`${role}:${key}`]: !allowed})); toast.error(error.message); } else toast.success('Permission updated'); };
  if (!canManage) return <p className="p-6 text-red-600">Admin or Doctor Admin access required.</p>;
  return <div className="max-w-5xl p-6 space-y-5"><Button variant="ghost" asChild><Link to="/clinic/settings"><ArrowLeft className="h-4 w-4 mr-1"/>Back to Settings</Link></Button><div><h1 className="text-2xl font-semibold">Clinic Permissions</h1><p className="text-sm text-slate-500">Choose what each clinic role can do. Database security remains enforced.</p></div><Card><CardContent className="p-0 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-4 text-left">Permission</th>{ROLES.map(r=><th key={r} className="p-4 text-center whitespace-nowrap">{labels[r]}</th>)}</tr></thead><tbody>{PERMISSIONS.map(([key,name])=><tr key={key} className="border-b"><td className="p-4 font-medium">{name}</td>{ROLES.map(r=><td key={r} className="p-4 text-center"><Switch disabled={loading || key==='access.manage_permissions' && (r==='admin'||r==='doctor_admin')} checked={!!matrix[`${r}:${key}`]} onCheckedChange={v=>toggle(r,key,v)}/></td>)}</tr>)}</tbody></table></CardContent></Card><div className="text-xs text-slate-500 flex gap-2"><ShieldCheck className="h-4 w-4"/>Only Admin and Doctor Admin can change this matrix.</div></div>;
}
