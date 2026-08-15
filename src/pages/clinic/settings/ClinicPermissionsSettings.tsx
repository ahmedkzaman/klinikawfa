import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { useClinicUsers } from '@/hooks/clinic/useClinicUsers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const ROLES: AppRole[] = [
  'admin',
  'doctor_admin',
  'resident_doctor',
  'locum',
  'ops_staff',
  'staff',
];

const PERMISSIONS = [
  ['access.manage_permissions', 'Manage permissions'],
  ['patients.view', 'View patients'],
  ['patients.edit', 'Edit patients'],
  ['queue.manage', 'Manage queue'],
  ['consultation.write', 'Write consultation'],
  ['billing.manage', 'Manage billing'],
  ['reports.view', 'View reports'],
  ['settings.manage', 'Manage clinic settings'],
  ['management_dashboard.view', 'View management dashboard'],
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  doctor_admin: 'Doctor Admin',
  resident_doctor: 'Resident Doctor',
  locum: 'Locum',
  ops_staff: 'Operations Staff',
  staff: 'Staff',
};

type UserPermissionDetail = {
  permission_key: string;
  role_allowed: boolean;
  override_allowed: boolean | null;
  effective_allowed: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

type RolePermissionRow = {
  role: AppRole;
  permission_key: string;
  allowed: boolean;
};

export default function ClinicPermissionsSettings() {
  const { isAdmin, isDoctorAdmin } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useClinicUsers();
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [details, setDetails] = useState<Record<string, UserPermissionDetail>>({});
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const canManage = isAdmin || isDoctorAdmin;

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId),
    [selectedUserId, users],
  );

  const loadMatrix = async () => {
    const { data, error } = await supabase.rpc('get_clinic_permission_matrix');
    if (error) {
      toast.error(error.message);
    } else {
      setMatrix(
        Object.fromEntries(
          ((data ?? []) as RolePermissionRow[]).map((item) => [
            `${item.role}:${item.permission_key}`,
            item.allowed,
          ]),
        ),
      );
    }
    setLoadingMatrix(false);
  };

  const loadUserPermissions = async (userId: string) => {
    setLoadingUser(true);
    const { data, error } = await supabase.rpc(
      'get_clinic_user_permission_details',
      { _target_user_id: userId },
    );
    if (error) {
      toast.error(error.message);
      setDetails({});
    } else {
      setDetails(
        Object.fromEntries(
          ((data ?? []) as UserPermissionDetail[]).map((item) => [
            item.permission_key,
            item,
          ]),
        ),
      );
    }
    setLoadingUser(false);
  };

  useEffect(() => {
    if (canManage) void loadMatrix();
  }, [canManage]);

  useEffect(() => {
    if (selectedUserId) void loadUserPermissions(selectedUserId);
    else setDetails({});
  }, [selectedUserId]);

  const toggleRole = async (
    role: AppRole,
    permissionKey: string,
    allowed: boolean,
  ) => {
    const stateKey = `${role}:${permissionKey}`;
    setMatrix((current) => ({ ...current, [stateKey]: allowed }));
    const { error } = await supabase.rpc('set_clinic_permission', {
      _role: role,
      _permission_key: permissionKey,
      _allowed: allowed,
    });
    if (error) {
      setMatrix((current) => ({ ...current, [stateKey]: !allowed }));
      toast.error(error.message);
    } else {
      toast.success('Role permission updated');
      if (selectedUserId) void loadUserPermissions(selectedUserId);
    }
  };

  const setUserOverride = async (
    permissionKey: string,
    value: 'inherit' | 'allow' | 'deny',
  ) => {
    if (!selectedUserId) return;
    setPendingKey(permissionKey);
    const result =
      value === 'inherit'
        ? await supabase.rpc('reset_clinic_user_permission_override', {
            _target_user_id: selectedUserId,
            _permission_key: permissionKey,
          })
        : await supabase.rpc('set_clinic_user_permission_override', {
            _target_user_id: selectedUserId,
            _permission_key: permissionKey,
            _allowed: value === 'allow',
          });

    if (result.error) toast.error(result.error.message);
    else {
      toast.success(value === 'inherit' ? 'Role default restored' : 'Account override saved');
      await loadUserPermissions(selectedUserId);
      window.dispatchEvent(new Event('clinic-permissions-changed'));
    }
    setPendingKey(null);
  };

  const resetAllOverrides = async () => {
    if (!selectedUserId) return;
    setPendingKey('all');
    const { error } = await supabase.rpc('reset_clinic_user_permission_override', {
      _target_user_id: selectedUserId,
      _permission_key: null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('All account overrides reset');
      await loadUserPermissions(selectedUserId);
      window.dispatchEvent(new Event('clinic-permissions-changed'));
    }
    setPendingKey(null);
  };

  if (!canManage) {
    return <p className="p-6 text-red-600">Admin or Doctor Admin access required.</p>;
  }

  return (
    <div className="max-w-6xl p-6 space-y-5">
      <Button variant="ghost" asChild>
        <Link to="/clinic/settings">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">Clinic Permissions</h1>
        <p className="text-sm text-slate-500">
          Set role defaults and account-specific exceptions.
        </p>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Role Permissions</TabsTrigger>
          <TabsTrigger value="accounts">Individual Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-4 text-left">Permission</th>
                    {ROLES.map((role) => (
                      <th key={role} className="p-4 text-center whitespace-nowrap">
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map(([key, name]) => (
                    <tr key={key} className="border-b">
                      <td className="p-4 font-medium">{name}</td>
                      {ROLES.map((role) => (
                        <td key={role} className="p-4 text-center">
                          <Switch
                            disabled={
                              loadingMatrix ||
                              (key === 'access.manage_permissions' &&
                                (role === 'admin' || role === 'doctor_admin'))
                            }
                            checked={!!matrix[`${role}:${key}`]}
                            onCheckedChange={(value) => toggleRole(role, key, value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5 flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2 min-w-[320px]">
                <label className="text-sm font-medium">Select account</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={usersLoading ? 'Loading accounts…' : 'Choose a user'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.full_name || account.email} —{' '}
                        {ROLE_LABELS[account.role ?? ''] || account.role || 'No role'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUserId && (
                <Button
                  variant="outline"
                  disabled={pendingKey !== null}
                  onClick={resetAllOverrides}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset all overrides
                </Button>
              )}
            </CardContent>
          </Card>

          {selectedUser && (
            <Card>
              <CardContent className="p-0 overflow-auto">
                <div className="p-5 border-b">
                  <div className="font-semibold">
                    {selectedUser.full_name || selectedUser.email}
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedUser.email} ·{' '}
                    {ROLE_LABELS[selectedUser.role ?? ''] || selectedUser.role || 'No role'}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-4 text-left">Permission</th>
                      <th className="p-4 text-left">Role default</th>
                      <th className="p-4 text-left">Account setting</th>
                      <th className="p-4 text-left">Effective access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map(([key, name]) => {
                      const detail = details[key];
                      const setting =
                        detail?.override_allowed === true
                          ? 'allow'
                          : detail?.override_allowed === false
                            ? 'deny'
                            : 'inherit';
                      const protectedSetting =
                        key === 'access.manage_permissions' &&
                        (selectedUser.role === 'admin' ||
                          selectedUser.role === 'doctor_admin');
                      return (
                        <tr key={key} className="border-b">
                          <td className="p-4 font-medium">{name}</td>
                          <td className="p-4">
                            <Badge variant={detail?.role_allowed ? 'default' : 'secondary'}>
                              {detail?.role_allowed ? 'Allowed' : 'Denied'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Select
                              value={setting}
                              disabled={
                                loadingUser || pendingKey !== null || protectedSetting
                              }
                              onValueChange={(value) =>
                                setUserOverride(
                                  key,
                                  value as 'inherit' | 'allow' | 'deny',
                                )
                              }
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inherit">Use role default</SelectItem>
                                <SelectItem value="allow">Allow</SelectItem>
                                <SelectItem value="deny">Deny</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-4">
                            <Badge
                              variant={detail?.effective_allowed ? 'default' : 'destructive'}
                            >
                              {detail?.effective_allowed ? 'Allowed' : 'Denied'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-xs text-slate-500 flex gap-2">
        <ShieldCheck className="h-4 w-4" />
        Account overrides take priority over role defaults. Only Admin and Doctor Admin
        can make changes.
      </div>
    </div>
  );
}
