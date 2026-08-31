import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  'special_admin',
  'doctor_admin',
  'resident_doctor',
  'locum',
  'operations',
  'ops_staff',
  'purchaser',
  'staff_nurse',
  'staff',
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  special_admin: 'Special Admin',
  doctor_admin: 'Doctor Admin',
  resident_doctor: 'Resident Doctor',
  locum: 'Locum',
  operations: 'Operations',
  ops_staff: 'Operations Staff',
  purchaser: 'Purchaser',
  staff_nurse: 'Staff Nurse',
  staff: 'Staff',
};

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
  ['procurement.approve', 'Approve purchase orders'],
  ['inventory.manage', 'Inventory management'],
] as const;

const PERMISSION_HELP: Record<string, string> = {
  'access.manage_permissions': 'Edit this permissions page',
  'patients.view': 'Read patient records',
  'patients.edit': 'Change patient records',
  'queue.manage': 'Call, skip, and reorder the patient queue',
  'consultation.write': 'Create and edit clinical notes',
  'billing.manage': 'Invoices, payments, discounts, refunds',
  'reports.view': 'Operational and financial reports',
  'settings.manage': 'Clinic preferences and configuration',
  'management_dashboard.view': 'Management KPI dashboard',
  'procurement.approve': 'Approve purchase orders above the routine limit or over budget',
  'inventory.manage': 'Add or edit items, adjust stock, change prices',
};

/** Grants that deserve an explicit confirmation before they take effect. */
const SENSITIVE_GRANTS = new Set(['billing.manage', 'settings.manage', 'access.manage_permissions']);

export type UserPermissionDetail = {
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'accounts' ? 'accounts' : 'roles';
  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'roles') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };
  const { data: users = [], isLoading: usersLoading } = useClinicUsers();
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [details, setDetails] = useState<Record<string, UserPermissionDetail>>({});
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [dbCanManage, setDbCanManage] = useState<boolean | null>(null);
  const [confirmGrant, setConfirmGrant] = useState<{ role: AppRole; key: string } | null>(null);
  const canManage = isAdmin || isDoctorAdmin || dbCanManage === true;

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
    let cancelled = false;
    // Trust the database, not role names: the same gate every RPC on this
    // page enforces server-side (can_manage_clinic_permissions).
    supabase
      .rpc('can_manage_clinic_permissions')
      .then(({ data, error }) => {
        if (cancelled) return;
        setDbCanManage(error ? false : Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (canManage) void loadMatrix();
  }, [canManage]);

  useEffect(() => {
    if (selectedUserId) void loadUserPermissions(selectedUserId);
    else setDetails({});
  }, [selectedUserId]);

  const applyRoleChange = async (
    role: AppRole,
    permissionKey: string,
    allowed: boolean,
  ) => {
    const stateKey = `${role}:${permissionKey}`;
    setPendingCell(stateKey);
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
    setPendingCell(null);
  };

  const toggleRole = (role: AppRole, permissionKey: string, allowed: boolean) => {
    if (allowed && SENSITIVE_GRANTS.has(permissionKey)) {
      setConfirmGrant({ role, key: permissionKey });
      return;
    }
    void applyRoleChange(role, permissionKey, allowed);
  };

  const setUserOverride = async (
    permissionKey: string,
    value: 'inherit' | 'allow' | 'deny',
  ) => {
    if (!selectedUserId) return;
    setPendingCell(permissionKey);
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
    setPendingCell(null);
  };

  const resetAllOverrides = async () => {
    if (!selectedUserId) return;
    setPendingCell('all');
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
    setPendingCell(null);
  };

  if (!canManage) {
    return (
      <div className="max-w-6xl p-6 space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/clinic/settings">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Link>
        </Button>
        {dbCanManage === null ? (
          <p className="text-sm text-slate-500">Checking your access…</p>
        ) : (
          <p className="text-red-600">Admin or Doctor Admin access required.</p>
        )}
      </div>
    );
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

      <Tabs value={activeTab} onValueChange={setTab}>
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
                    <th className="p-4 text-left sticky left-0 bg-card z-10 min-w-[220px]">Permission</th>
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
                      <td className="p-4 font-medium sticky left-0 bg-card z-10">
                        <span title={PERMISSION_HELP[key]} className="cursor-help">
                          {name}
                        </span>
                      </td>
                      {ROLES.map((role) => {
                        const stateKey = `${role}:${key}`;
                        return (
                          <td key={role} className="p-4 text-center">
                            <Switch
                              disabled={
                                loadingMatrix ||
                                pendingCell === stateKey ||
                                (key === 'access.manage_permissions' &&
                                  (role === 'admin' || role === 'doctor_admin'))
                              }
                              checked={!!matrix[stateKey]}
                              onCheckedChange={(value) => toggleRole(role, key, value)}
                            />
                          </td>
                        );
                      })}
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
                  <SelectTrigger aria-label="Select account">
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
                  disabled={pendingCell !== null}
                  onClick={resetAllOverrides}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset all overrides
                </Button>
              )}
            </CardContent>
          </Card>

          {selectedUser && (
            <AccountPermissionsTable
              user={selectedUser}
              details={details}
              pending={pendingCell}
              onOverride={(key, value) => void setUserOverride(key, value)}
            />
          )}
        </TabsContent>
      </Tabs>

      <div className="text-xs text-slate-500 flex gap-2">
        <ShieldCheck className="h-4 w-4" />
        Account overrides take priority over role defaults. Only Admin and Doctor Admin
        can make changes.
      </div>

      <AlertDialog
        open={confirmGrant !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmGrant(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmGrant &&
                `Allow ${ROLE_LABELS[confirmGrant.role]} to ${PERMISSIONS.find(([k]) => k === confirmGrant.key)?.[1]?.toLowerCase()}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This grants the role immediate access for every account holding it. You can
              revoke it later from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmGrant(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGrant) {
                  void applyRoleChange(confirmGrant.role, confirmGrant.key, true);
                }
                setConfirmGrant(null);
              }}
            >
              Grant access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


export function AccountPermissionsTable({
  user,
  details,
  pending,
  onOverride,
}: {
  user: { full_name: string | null; email: string; role: string | null };
  details: Record<string, UserPermissionDetail>;
  pending: string | null;
  onOverride: (permissionKey: string, value: 'inherit' | 'allow' | 'deny') => void;
}) {
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <div className="p-5 border-b">
          <div className="font-semibold">{user.full_name || user.email}</div>
          <div className="text-sm text-slate-500">
            {user.email} · {ROLE_LABELS[user.role ?? ''] || user.role || 'No role'}
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
                (user.role === 'admin' || user.role === 'doctor_admin');
              return (
                <tr key={key} className="border-b">
                  <td className="p-4 font-medium">
                    <span title={PERMISSION_HELP[key]} className="cursor-help">
                      {name}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge variant={detail?.role_allowed ? 'default' : 'secondary'}>
                      {detail?.role_allowed ? 'Allowed' : 'Denied'}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Select
                      value={setting}
                      disabled={pending !== null || protectedSetting}
                      onValueChange={(value) =>
                        onOverride(key, value as 'inherit' | 'allow' | 'deny')
                      }
                    >
                      <SelectTrigger className="w-[180px]" aria-label={`Account setting for ${name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Use role default</SelectItem>
                        <SelectItem value="allow">Allow</SelectItem>
                        <SelectItem value="deny">Deny</SelectItem>
                      </SelectContent>
                    </Select>
                    {detail?.updated_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Updated{' '}
                        <time dateTime={detail.updated_at} title={detail.updated_at}>
                          {formatDistanceToNowStrict(new Date(detail.updated_at), {
                            addSuffix: true,
                          })}
                        </time>
                      </p>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge variant={detail?.effective_allowed ? 'default' : 'destructive'}>
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
  );
}
