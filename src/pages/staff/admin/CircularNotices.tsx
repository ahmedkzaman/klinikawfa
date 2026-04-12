import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Megaphone, Plus, Edit, Eye, Users, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CircularNotice {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_active: boolean;
  created_by: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

interface Acknowledgement {
  id: string;
  notice_id: string;
  user_id: string;
  acknowledged_at: string;
}

export default function CircularNotices() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<CircularNotice[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<CircularNotice | null>(null);
  const [editingNotice, setEditingNotice] = useState<CircularNotice | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState('normal');
  const [formActive, setFormActive] = useState(true);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('circular-notices-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notices' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notice_acknowledgements' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [noticesRes, acksRes, profilesRes] = await Promise.all([
      supabase.from('circular_notices').select('*').order('published_at', { ascending: false }),
      supabase.from('circular_notice_acknowledgements').select('*'),
      supabase.from('profiles').select('id, full_name, email'),
    ]);
    setNotices((noticesRes.data as any[]) || []);
    setAcknowledgements((acksRes.data as any[]) || []);
    const pMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => { pMap[p.id] = p.full_name || p.email; });
    setProfiles(pMap);
    setLoading(false);
  };

  const resetForm = () => {
    setFormTitle(''); setFormContent(''); setFormPriority('normal'); setFormActive(true);
    setEditingNotice(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (notice: CircularNotice) => {
    setEditingNotice(notice);
    setFormTitle(notice.title);
    setFormContent(notice.content);
    setFormPriority(notice.priority);
    setFormActive(notice.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) { toast.error('Title and content are required'); return; }
    if (editingNotice) {
      const { error } = await supabase.from('circular_notices').update({
        title: formTitle.trim(), content: formContent.trim(), priority: formPriority, is_active: formActive,
      }).eq('id', editingNotice.id);
      if (error) { toast.error('Failed to update'); return; }
      toast.success('Notice updated');
    } else {
      const { error } = await supabase.from('circular_notices').insert({
        title: formTitle.trim(), content: formContent.trim(), priority: formPriority, is_active: formActive, created_by: user!.id,
      });
      if (error) { toast.error('Failed to create'); return; }
      toast.success('Notice published');
    }
    setDialogOpen(false); resetForm(); fetchData();
  };

  const toggleActive = async (notice: CircularNotice) => {
    await supabase.from('circular_notices').update({ is_active: !notice.is_active }).eq('id', notice.id);
    fetchData();
  };

  const viewAcks = (notice: CircularNotice) => { setSelectedNotice(notice); setViewDialogOpen(true); };

  const getAckCount = (noticeId: string) => acknowledgements.filter(a => a.notice_id === noticeId).length;
  const getAcksForNotice = (noticeId: string) => acknowledgements.filter(a => a.notice_id === noticeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Circular Notices</h1>
          <p className="text-muted-foreground text-sm">Create and manage announcements for all staff</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New Notice</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : notices.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No notices yet. Create your first announcement.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {notices.map(notice => (
            <Card key={notice.id} className={!notice.is_active ? 'opacity-60' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Megaphone className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-semibold text-sm truncate">{notice.title}</h3>
                      <Badge variant={notice.priority === 'urgent' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {notice.priority}
                      </Badge>
                      {!notice.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{notice.content}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Published {format(new Date(notice.published_at), 'MMM d, yyyy h:mm a')}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{getAckCount(notice.id)} acknowledged</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewAcks(notice)} title="View acknowledgements">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(notice)} title="Edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Switch checked={notice.is_active} onCheckedChange={() => toggleActive(notice)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNotice ? 'Edit Notice' : 'Create New Notice'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Notice title" />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="Notice content..." rows={6} />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <Label>Active</Label>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingNotice ? 'Update Notice' : 'Publish Notice'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Acknowledgements Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledgements — {selectedNotice?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {selectedNotice && getAcksForNotice(selectedNotice.id).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No staff have acknowledged this notice yet.</p>
            ) : (
              selectedNotice && getAcksForNotice(selectedNotice.id).map(ack => (
                <div key={ack.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-sm flex-1">{profiles[ack.user_id] || ack.user_id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(ack.acknowledged_at), 'MMM d, h:mm a')}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
