import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Plus, 
  Trash2, 
  Loader2,
  RefreshCw,
  UserPlus,
  Shield,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Navigate } from 'react-router-dom';

type Profile = Tables<'profiles'>;
type UserRole = Tables<'user_roles'>;
type AppRole = 'admin' | 'staff';

interface UserWithRole extends Profile {
  roles: AppRole[];
}

export default function UserManagement() {
  const { language } = useLanguage();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [addForm, setAddForm] = useState({
    email: '',
    role: 'staff' as AppRole,
  });
  const [adding, setAdding] = useState(false);

  // Only admins can access this page
  if (!isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        ...profile,
        roles: (roles || [])
          .filter(r => r.user_id === profile.id)
          .map(r => r.role as AppRole),
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan pengguna.' : 'Failed to load users.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUserRole = async (userId: string, newRole: AppRole | 'none') => {
    setUpdating(userId);
    try {
      // First, remove all existing roles for this user
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // If new role is not 'none', add the new role
      if (newRole !== 'none') {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === userId 
          ? { ...user, roles: newRole === 'none' ? [] : [newRole] }
          : user
      ));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Peranan dikemaskini.' : 'Role updated.',
      });
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal mengemaskini peranan.' : 'Failed to update role.',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const addUserRole = async () => {
    if (!addForm.email.trim()) return;

    setAdding(true);
    try {
      // Find user by email in profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', addForm.email.trim().toLowerCase())
        .single();

      if (profileError || !profile) {
        toast({
          title: language === 'ms' ? 'Ralat' : 'Error',
          description: language === 'ms' 
            ? 'Pengguna tidak dijumpai. Pastikan mereka sudah mendaftar.'
            : 'User not found. Make sure they have registered first.',
          variant: 'destructive',
        });
        return;
      }

      // Check if role already exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', profile.id)
        .eq('role', addForm.role)
        .single();

      if (existingRole) {
        toast({
          title: language === 'ms' ? 'Ralat' : 'Error',
          description: language === 'ms' 
            ? 'Pengguna sudah mempunyai peranan ini.'
            : 'User already has this role.',
          variant: 'destructive',
        });
        return;
      }

      // Add role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: profile.id, role: addForm.role });

      if (error) throw error;

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Peranan ditambah.' : 'Role added.',
      });

      setShowAddDialog(false);
      setAddForm({ email: '', role: 'staff' });
      fetchUsers();
    } catch (error) {
      console.error('Error adding role:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal menambah peranan.' : 'Failed to add role.',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const removeAllRoles = async () => {
    if (!deleteUserId) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deleteUserId);

      if (error) throw error;

      setUsers(users.map(user => 
        user.id === deleteUserId ? { ...user, roles: [] } : user
      ));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Peranan dibuang.' : 'Roles removed.',
      });
    } catch (error) {
      console.error('Error removing roles:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal membuang peranan.' : 'Failed to remove roles.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteUserId(null);
    }
  };

  const getRoleLabel = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return language === 'ms' ? 'Admin' : 'Admin';
      case 'staff':
        return language === 'ms' ? 'Staf' : 'Staff';
      default:
        return role;
    }
  };

  const getUserCurrentRole = (user: UserWithRole): AppRole | 'none' => {
    if (user.roles.includes('admin')) return 'admin';
    if (user.roles.includes('staff')) return 'staff';
    return 'none';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {language === 'ms' ? 'Pengurusan Pengguna' : 'User Management'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ms' 
              ? `${users.length} pengguna berdaftar` 
              : `${users.length} registered users`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Tambah Peranan' : 'Add Role'}
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {language === 'ms' 
                ? 'Tiada pengguna berdaftar.' 
                : 'No registered users.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ms' ? 'Email' : 'Email'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Nama' : 'Name'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Peranan' : 'Role'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Dicipta' : 'Created'}</TableHead>
                    <TableHead className="text-right">{language === 'ms' ? 'Tindakan' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={getUserCurrentRole(user)}
                          onValueChange={(value) => updateUserRole(user.id, value as AppRole | 'none')}
                          disabled={updating === user.id}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue>
                              {getUserCurrentRole(user) === 'none' ? (
                                <span className="text-muted-foreground">
                                  {language === 'ms' ? 'Tiada Peranan' : 'No Role'}
                                </span>
                              ) : getUserCurrentRole(user) === 'admin' ? (
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="h-4 w-4" />
                                  Admin
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Shield className="h-4 w-4" />
                                  {language === 'ms' ? 'Staf' : 'Staff'}
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="staff">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                {language === 'ms' ? 'Staf' : 'Staff'}
                              </div>
                            </SelectItem>
                            <SelectItem value="none">
                              {language === 'ms' ? 'Tiada Peranan' : 'No Role'}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(user.created_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.roles.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setDeleteUserId(user.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'ms' ? 'Tambah Peranan' : 'Add Role'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ms' 
                ? 'Tambah peranan kepada pengguna sedia ada. Mereka mesti mendaftar terlebih dahulu.'
                : 'Add a role to an existing user. They must register first.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{language === 'ms' ? 'Email Pengguna' : 'User Email'} *</Label>
              <Input
                id="email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Peranan' : 'Role'} *</Label>
              <Select
                value={addForm.role}
                onValueChange={(value) => setAddForm(prev => ({ ...prev, role: value as AppRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">{language === 'ms' ? 'Staf' : 'Staff'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={adding}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </Button>
            <Button onClick={addUserRole} disabled={!addForm.email.trim() || adding}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plus className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Tambah' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ms' ? 'Buang Peranan?' : 'Remove Roles?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ms' 
                ? 'Ini akan membuang semua peranan daripada pengguna ini. Mereka tidak akan dapat mengakses panel admin.'
                : 'This will remove all roles from this user. They will no longer be able to access the admin panel.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={removeAllRoles} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ms' ? 'Buang' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
