import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Pencil,
  User,
  Stethoscope,
  Users,
  Search,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TeamMember {
  id: string;
  type: 'doctor' | 'staff';
  name_ms: string;
  name_en: string;
  title_ms: string;
  title_en: string;
  qualifications: string[];
  years_experience: number | null;
  expertise_ms: string[];
  expertise_en: string[];
  bio_ms: string | null;
  bio_en: string | null;
  photo_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function TeamManagement() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'doctor' | 'staff'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMembers((data as TeamMember[]) || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan data pasukan.' : 'Failed to load team data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const toggleActive = async (id: string, currentValue: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('team_members')
        .update({ is_active: !currentValue })
        .eq('id', id);

      if (error) throw error;

      setMembers(members.map(m => 
        m.id === id ? { ...m, is_active: !currentValue } : m
      ));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Status dikemaskini.' : 'Status updated.',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal mengemaskini status.' : 'Failed to update status.',
        variant: 'destructive',
      });
    }
  };

  const moveOrder = async (index: number, direction: 'up' | 'down') => {
    const filteredMembers = getFilteredMembers();
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= filteredMembers.length) return;

    const member1 = filteredMembers[index];
    const member2 = filteredMembers[newIndex];

    try {
      // Swap display_order values
      await (supabase as any)
        .from('team_members')
        .update({ display_order: member2.display_order })
        .eq('id', member1.id);
      
      await (supabase as any)
        .from('team_members')
        .update({ display_order: member1.display_order })
        .eq('id', member2.id);

      fetchMembers();
    } catch (error) {
      console.error('Error reordering:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal menyusun semula.' : 'Failed to reorder.',
        variant: 'destructive',
      });
    }
  };

  const deleteMember = async () => {
    if (!deleteId) return;

    const member = members.find(m => m.id === deleteId);
    if (!member) return;

    setDeleting(true);
    try {
      // Delete photo from storage if exists
      if (member.photo_url) {
        const urlParts = member.photo_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        await supabase.storage
          .from('team-photos')
          .remove([fileName]);
      }

      // Delete from database
      const { error } = await (supabase as any)
        .from('team_members')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setMembers(members.filter(m => m.id !== deleteId));
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Ahli pasukan dipadam.' : 'Team member deleted.',
      });
    } catch (error) {
      console.error('Error deleting member:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memadam ahli pasukan.' : 'Failed to delete team member.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const getFilteredMembers = () => {
    return members.filter(m => {
      const matchesType = filterType === 'all' || m.type === filterType;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' || 
        m.name_ms.toLowerCase().includes(searchLower) ||
        m.name_en.toLowerCase().includes(searchLower) ||
        m.title_ms.toLowerCase().includes(searchLower) ||
        m.title_en.toLowerCase().includes(searchLower);
      return matchesType && matchesSearch;
    });
  };

  const filteredMembers = getFilteredMembers();
  const doctorCount = members.filter(m => m.type === 'doctor').length;
  const staffCount = members.filter(m => m.type === 'staff').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {language === 'ms' ? 'Pasukan' : 'Team'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ms' 
              ? `${doctorCount} doktor, ${staffCount} kakitangan` 
              : `${doctorCount} doctors, ${staffCount} staff`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchMembers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => navigate('/staff/website/team/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Tambah' : 'Add'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={language === 'ms' ? 'Cari nama...' : 'Search name...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as 'all' | 'doctor' | 'staff')}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {language === 'ms' ? 'Semua' : 'All'}
            </SelectItem>
            <SelectItem value="doctor">
              <span className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                {language === 'ms' ? 'Doktor' : 'Doctors'}
              </span>
            </SelectItem>
            <SelectItem value="staff">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {language === 'ms' ? 'Kakitangan' : 'Staff'}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              {members.length === 0 
                ? (language === 'ms' ? 'Tiada ahli pasukan. Tambah ahli pertama anda.' : 'No team members. Add your first member.')
                : (language === 'ms' ? 'Tiada hasil dijumpai.' : 'No results found.')
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMembers.map((member, index) => (
            <Card key={member.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  {/* Photo */}
                  <div className="flex h-32 w-full items-center justify-center bg-muted sm:h-auto sm:w-32 md:w-40">
                    {member.photo_url ? (
                      <img
                        src={member.photo_url}
                        alt={language === 'ms' ? member.name_ms : member.name_en}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {language === 'ms' ? member.name_ms : member.name_en}
                          </h3>
                          <Badge variant={member.type === 'doctor' ? 'default' : 'secondary'}>
                            {member.type === 'doctor' 
                              ? (language === 'ms' ? 'Doktor' : 'Doctor')
                              : (language === 'ms' ? 'Kakitangan' : 'Staff')
                            }
                          </Badge>
                          {!member.is_active && (
                            <Badge variant="outline" className="text-muted-foreground">
                              {language === 'ms' ? 'Tidak Aktif' : 'Inactive'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {language === 'ms' ? member.title_ms : member.title_en}
                        </p>
                        {member.qualifications.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {member.qualifications.map((q, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {q}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">
                            {language === 'ms' ? 'Aktif' : 'Active'}
                          </span>
                          <Switch
                            checked={member.is_active}
                            onCheckedChange={() => toggleActive(member.id, member.is_active)}
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => moveOrder(index, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => moveOrder(index, 'down')}
                            disabled={index === filteredMembers.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/staff/website/team/${member.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(member.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ms' ? 'Padam Ahli Pasukan?' : 'Delete Team Member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ms' 
                ? 'Tindakan ini tidak boleh dibatalkan. Data dan gambar akan dipadam secara kekal.'
                : 'This action cannot be undone. All data and photos will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteMember} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ms' ? 'Padam' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
