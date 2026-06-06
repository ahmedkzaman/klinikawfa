import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MessageSquare, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StaffMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
};

type OnlineUser = {
  user_id: string;
  name: string;
  online_at: string;
};

const CHAT_CHANNEL = 'staff-chat-room';
const PRESENCE_CHANNEL = 'staff-chat-online';
const PAGE_SIZE = 50;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function StaffChat() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [displayName, setDisplayName] = useState<string>('Staff');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const myId = user?.id ?? null;
  const eligible = !!myId && !!role && role !== 'guest';

  // Fetch display name once
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', myId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDisplayName(data?.full_name || data?.email || user?.email || 'Staff');
      });
    return () => {
      cancelled = true;
    };
  }, [myId, user?.email]);

  // Load history + subscribe to new messages
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('staff_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load staff messages', error);
          setLoading(false);
          return;
        }
        setMessages(((data ?? []) as StaffMessage[]).slice().reverse());
        setLoading(false);
      });

    const channel = supabase
      .channel(CHAT_CHANNEL)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_messages' },
        (payload) => {
          const row = payload.new as StaffMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [eligible]);

  // Presence: online users
  useEffect(() => {
    if (!eligible || !myId) return;
    const room = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: myId } },
    });

    const computeOnline = () => {
      const state = room.presenceState<OnlineUser>();
      const flat: OnlineUser[] = [];
      const seen = new Set<string>();
      for (const arr of Object.values(state)) {
        for (const p of arr) {
          if (p?.user_id && !seen.has(p.user_id)) {
            seen.add(p.user_id);
            flat.push(p);
          }
        }
      }
      flat.sort((a, b) => a.name.localeCompare(b.name));
      setOnlineUsers(flat);
    };

    room
      .on('presence', { event: 'sync' }, computeOnline)
      .on('presence', { event: 'join' }, computeOnline)
      .on('presence', { event: 'leave' }, computeOnline)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({
            user_id: myId,
            name: displayName,
            online_at: new Date().toISOString(),
          } satisfies OnlineUser);
        }
      });

    return () => {
      room.untrack().catch(() => {});
      supabase.removeChannel(room);
    };
  }, [eligible, myId, displayName]);

  // Auto-scroll to bottom on new messages / open
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, [messages.length, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !myId || sending) return;
    setSending(true);
    const { error } = await supabase.from('staff_messages').insert({
      sender_id: myId,
      sender_name: displayName,
      content: text,
    });
    setSending(false);
    if (error) {
      toast.error('Failed to send message');
      return;
    }
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onlineCount = onlineUsers.length;
  const otherOnline = useMemo(
    () => onlineUsers.filter((u) => u.user_id !== myId),
    [onlineUsers, myId]
  );

  if (!eligible) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-14 w-14 rounded-full shadow-xl bg-blue-600 hover:bg-blue-700 text-white"
          aria-label="Open staff chat"
        >
          <MessageSquare className="h-6 w-6" />
          {onlineCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {onlineCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Staff Chat</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {onlineCount} online
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Online list */}
        <div className="border-b bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
            <Users className="h-3.5 w-3.5" />
            Currently Online
          </div>
          {onlineUsers.length === 0 ? (
            <div className="text-xs text-muted-foreground">No one online</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {onlineUsers.map((u) => (
                <Badge
                  key={u.user_id}
                  variant="secondary"
                  className="gap-1.5 font-normal pl-1.5"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {u.user_id === myId ? `${u.name} (you)` : u.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="px-4 py-3 flex flex-col gap-2">
            {loading && messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                No messages yet. Say hello to the team!
              </div>
            ) : (
              messages.map((m, idx) => {
                const mine = m.sender_id === myId;
                const prev = messages[idx - 1];
                const showHeader = !prev || prev.sender_id !== m.sender_id;
                return (
                  <div
                    key={m.id}
                    className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
                  >
                    {showHeader && !mine && (
                      <div className="text-[11px] text-muted-foreground mb-0.5 px-2">
                        {m.sender_name}
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                        mine
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}
                    >
                      {m.content}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 px-2">
                      {formatTime(m.created_at)}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Composer */}
        <div className="border-t p-3 flex items-end gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            className="flex-1"
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={send}
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default StaffChat;
