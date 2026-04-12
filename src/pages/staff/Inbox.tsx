import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
  published_at: string;
}

export default function Inbox() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<CircularNotice[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('inbox-notices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notices' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notice_acknowledgements' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [noticesRes, acksRes] = await Promise.all([
      supabase.from('circular_notices').select('*').eq('is_active', true).order('published_at', { ascending: false }),
      supabase.from('circular_notice_acknowledgements').select('notice_id').eq('user_id', user.id),
    ]);
    setNotices((noticesRes.data as any[]) || []);
    setAckedIds(new Set((acksRes.data || []).map((a: any) => a.notice_id)));
    setLoading(false);
  };

  const acknowledge = async (noticeId: string) => {
    const { error } = await supabase.from('circular_notice_acknowledgements').insert({
      notice_id: noticeId, user_id: user!.id,
    });
    if (error) { toast.error('Failed to acknowledge'); return; }
    setAckedIds(prev => new Set([...prev, noticeId]));
    toast.success("Acknowledged");
  };

  const unread = notices.filter(n => !ackedIds.has(n.id));
  const read = notices.filter(n => ackedIds.has(n.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground text-sm">Circular notices & announcements</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : notices.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No notices at the moment.</CardContent></Card>
      ) : (
        <>
          {unread.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Unread ({unread.length})</h2>
              {unread.map(notice => (
                <Card key={notice.id} className="border-primary/30">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <Megaphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm">{notice.title}</h3>
                          {notice.priority === 'urgent' && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{format(new Date(notice.published_at), 'MMM d, yyyy h:mm a')}</p>
                        <div className={expanded === notice.id ? '' : 'line-clamp-3'}>
                          <p className="text-sm whitespace-pre-wrap">{notice.content}</p>
                        </div>
                        {notice.content.length > 200 && (
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs mt-1" onClick={() => setExpanded(expanded === notice.id ? null : notice.id)}>
                            {expanded === notice.id ? <><ChevronUp className="h-3 w-3 mr-0.5" />Show less</> : <><ChevronDown className="h-3 w-3 mr-0.5" />Read more</>}
                          </Button>
                        )}
                        <Button size="sm" className="mt-3" onClick={() => acknowledge(notice.id)}>
                          <CheckCircle className="h-4 w-4 mr-1.5" /> I've read & understood
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {read.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Read ({read.length})</h2>
              {read.map(notice => (
                <Card key={notice.id} className="opacity-70">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-sm">{notice.title}</h3>
                          {notice.priority === 'urgent' && <Badge variant="secondary" className="text-[10px]">Urgent</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{format(new Date(notice.published_at), 'MMM d, yyyy h:mm a')}</p>
                        {expanded === notice.id && <p className="text-sm whitespace-pre-wrap mt-2">{notice.content}</p>}
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs mt-1" onClick={() => setExpanded(expanded === notice.id ? null : notice.id)}>
                          {expanded === notice.id ? 'Hide' : 'View content'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
