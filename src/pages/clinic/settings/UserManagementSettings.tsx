import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users, Search, UserPlus, ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { useClinicUsers, type ClinicUserRow } from '@/hooks/clinic/useClinicUsers';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell, softInput } from '@/lib/clinic/bentoTokens';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DoctorProfileDialog } from '@/components/clinic/settings/DoctorProfileDialog';
import { AddUserDialog, type CreatableUserRole } from '@/components/clinic/settings/AddUserDialog';
import { toast } from 'sonner';

const ROLE_OPTIONS: AppRole[] = [
  'guest',
  'locum',
  'resident_doctor',
  'ops_staff',
  'doctor_admin',
  'admin',
  'special_admin',
  'website_editor',
];

const ROLE_LABEL: Record<AppRole, string> = {
  guest: 'Guest',
  staff: 'Staff (legacy)',
  locum: 'Locum Doctor',
  resident_doctor: 'Resident Doctor',
  operations: 'Operations (legacy)',
  ops_staff: 'Ops Staff',
  doctor_admin: 'Doctor Admin',
  admin: 'Admin',
  special_admin: 'Special Admin',
  website_editor: 'Website Editor',
};

export default function UserManagementSettings() {
  const { user, isAdmin, isSpecialAdmin, role } = useAuth();
  const { data: users = [], isLoading } = useClinicUsers();
  const qc = useQueryClient();

  const canAddLocum = isAdmin || isSpecialAdmin || role === 'staff';
  // Only admins can create employee accounts (resident doctors). Staff can only invite locums.
  const canAddResident = isAdmin || isSpecialAdmin;
  const canAddWebsiteEditor = isAdmin;

  const [search, setSearch] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [profileDialogUser, setProfileDialogUser] = useState<ClinicUserRow | null>(null);
  const [addUserDialog, setAddUserDialog] = useState<{ open: boolean; role: CreatableUserRole }>({
    open: false,
    role: 'locum',
  });

  if (!isAdmin && !isSpecialAdmin) {
    return (
      <div className="max-w-xl">
        <Alert variant="destructive">
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>
            You need admin privileges to manage users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  })();

  const handleRoleChange = async (row: ClinicUserRow, newRole: AppRole) => {
    if (newRole === row.role) return;
    setPendingUserId(row.id);
    try {
      const { error } = await supabase.rpc('admin_assign_role', {
        target_user_id: row.id,
        new_role: newRole,
      });
      if (error) throw error;
      toast.success(`Role updated to ${ROLE_LABEL[newRole]}`);
      qc.invalidateQueries({ queryKey: ['clinic_users'] });
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('NOT_AUTHORIZED')) {
        toast.error('Only special admins can change roles');
      } else if (msg.includes('CANNOT_DEMOTE_SELF')) {
        toast.error('You cannot change your own role');
      } else {
        toast.error(msg || 'Failed to update role');
      }
    } finally {
      setPendingUserId(null);
    }
  };

  const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
  const TR = 'border-slate-100';

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
              <Link to="/clinic/settings">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Settings
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">User Management</h1>
            <p className="text-sm text-slate-500">
              Assign roles and manage locum doctor profiles.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canAddLocum && (
              <Button
                variant="outline"
                onClick={() => setAddUserDialog({ open: true, role: 'locum' })}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Locum
              </Button>
            )}
            {canAddResident && (
              <Button onClick={() => setAddUserDialog({ open: true, role: 'resident_doctor' })}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Resident Doctor
              </Button>
            )}
            {canAddWebsiteEditor && (
              <Button onClick={() => setAddUserDialog({ open: true, role: 'website_editor' })}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Website Editor
              </Button>
            )}
          </div>
        </div>

        <Card className={bento}>
          <CardContent className="p-6 space-y-4">
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(softInput, 'pl-9')}
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent bg-slate-50/50')}>
                  <TableHead className={cn(TH, 'min-w-[220px]')}>Name / Email</TableHead>
                  <TableHead className={cn(TH, 'min-w-[200px]')}>Current Role</TableHead>
                  <TableHead className={cn(TH, 'min-w-[200px]')}>MMC / Verification</TableHead>
                  <TableHead className={cn(TH, 'min-w-[180px]')}>Doctor Profile</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Action</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-40 mb-1" />
                      <Skeleton className="h-3 w-56" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-9 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-32 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Users className="h-10 w-10 mb-2 opacity-50" />
                      <p className="text-sm">No users found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const isSelf = row.id === user?.id;
                  const roleSelectDisabled =
                    !isSpecialAdmin || isSelf || pendingUserId === row.id;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {row.full_name || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.role ?? ''}
                          onValueChange={(v) => handleRoleChange(row, v as AppRole)}
                          disabled={roleSelectDisabled}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="No role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {row.mmc_number ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {row.requested_role === 'locum' && (row.role === 'guest' || row.role === null) && (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                                  Pending Locum
                                </Badge>
                              )}
                              <span className="font-mono text-xs text-foreground">
                                {row.mmc_number}
                              </span>
                            </div>
                            <a
                              href="https://meritsmmc.moh.gov.my/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Verify on MMC
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {row.phone && (
                              <div className="text-xs text-muted-foreground">📞 {row.phone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.doctor ? (
                            <Badge
                              variant={
                                row.doctor.status === 'active' ? 'default' : 'secondary'
                              }
                            >
                              {row.doctor.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                          {row.doctor?.on_duty && (
                            <Badge variant="outline" className="text-xs">
                              On duty
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setProfileDialogUser(row)}
                        >
                          Manage Profile
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </CardContent>
        </Card>

        <DoctorProfileDialog
          open={!!profileDialogUser}
          onOpenChange={(open) => !open && setProfileDialogUser(null)}
          user={profileDialogUser}
        />
        <AddUserDialog
          open={addUserDialog.open}
          onOpenChange={(open) => setAddUserDialog((prev) => ({ ...prev, open }))}
          role={addUserDialog.role}
        />
      </div>
    </div>
  );
}
