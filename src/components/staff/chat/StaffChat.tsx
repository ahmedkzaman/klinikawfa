import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Hash, MessageSquare, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type StaffMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string | null;
  content: string;
  created_at: string;
};

type OnlineUser = {
  user_id: string;
  name: string;
  online_at: string;
};

type ActiveChat = 'global' | string;

const CHAT_CHANNEL = 'chat-room';
const PRESENCE_CHANNEL = 'online-users';
const PAGE_SIZE = 100;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function playAlarmBeep() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    const now = ctx.currentTime;
    const pattern = [880, 1175, 880];
    pattern.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const end = start + 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // ignore
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
  const [activeChat, setActiveChat] = useState<ActiveChat>('global');
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  const activeChatRef = useRef<ActiveChat>(activeChat);
  const myIdRef = useRef<string | null>(null);
  const initialLoadedRef = useRef(false);

  const myId = user?.id ?? null;
  const eligible = !!myId && !!role && role !== 'guest';

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // Reset unread when opening
  useEffect(() => {
    if (open) setUnreadCount(0);
  }, [open, activeChat]);

  // Vibrate periodically when there are unread messages and chat is closed
  useEffect(() => {
    if (!unreadCount || open) return;
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    const interval = window.setInterval(() => {
      try { navigator.vibrate([200, 100, 200]); } catch { /* noop */ }
    }, 5000);
    // initial buzz
    try { navigator.vibrate([200, 100, 200]); } catch { /* noop */ }
    return () => window.clearInterval(interval);
  }, [unreadCount, open]);

  // Display name
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

  // History + realtime subscription
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

  // Presence
  useEffect(() => {
    if (!eligible || !myId) return;
    const room = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: myId } },
    });

    const compute = () => {
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
      .on('presence', { event: 'sync' }, compute)
      .on('presence', { event: 'join' }, compute)
      .on('presence', { event: 'leave' }, compute)
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

  // Filtered messages for the active chat
  const visibleMessages = useMemo(() => {
    if (activeChat === 'global') {
      return messages.filter((m) => m.receiver_id === null);
    }
    return messages.filter(
      (m) =>
        (m.sender_id === myId && m.receiver_id === activeChat) ||
        (m.sender_id === activeChat && m.receiver_id === myId)
    );
  }, [messages, activeChat, myId]);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, [visibleMessages.length, open, activeChat]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !myId || sending) return;
    setSending(true);
    const { error } = await supabase.from('staff_messages').insert({
      sender_id: myId,
      sender_name: displayName,
      content: text,
      receiver_id: activeChat === 'global' ? null : activeChat,
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

  // Unread per peer / global (for badges)
  const unreadByPeer = useMemo(() => {
    const map: Record<string, number> = {};
    // Best-effort indicator: count of messages received from each peer (not persisted as read state)
    for (const m of messages) {
      if (m.sender_id === myId) continue;
      const key = m.receiver_id === null ? 'global' : m.sender_id;
      if (key === activeChat) continue;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [messages, myId, activeChat]);

  const peers = useMemo(
    () => onlineUsers.filter((u) => u.user_id !== myId),
    [onlineUsers, myId]
  );

  const activePeer =
    activeChat === 'global' ? null : peers.find((p) => p.user_id === activeChat) ?? null;
  const activePeerName =
    activeChat === 'global'
      ? 'Global Room'
      : activePeer?.name ??
        messages.find((m) => m.sender_id === activeChat)?.sender_name ??
        'Direct message';

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
          {onlineUsers.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {onlineUsers.length}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Staff Chat</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {onlineUsers.length} online
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Split body */}
        <div className="flex-1 min-h-0 flex">
          {/* Left: sidebar */}
          <aside className="w-44 sm:w-56 border-r bg-muted/30 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveChat('global')}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors',
                    activeChat === 'global'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">Global Room</span>
                  {unreadByPeer['global'] > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                      {unreadByPeer['global']}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Online
                </div>

                {peers.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No one else online.
                  </div>
                ) : (
                  peers.map((u) => {
                    const isActive = activeChat === u.user_id;
                    const unread = unreadByPeer[u.user_id] ?? 0;
                    return (
                      <button
                        key={u.user_id}
                        type="button"
                        onClick={() => setActiveChat(u.user_id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="flex-1 truncate">{u.name}</span>
                        {unread > 0 && (
                          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </aside>

          {/* Right: chat */}
          <section className="flex-1 min-w-0 flex flex-col">
            <div className="px-4 py-2 border-b bg-background flex items-center gap-2 shrink-0">
              {activeChat === 'global' ? (
                <Hash className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              <div className="text-sm font-medium truncate">{activePeerName}</div>
              {activeChat !== 'global' && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">
                  Private
                </span>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="px-4 py-3 flex flex-col gap-2">
                {loading && visibleMessages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-10">
                    Loading messages…
                  </div>
                ) : visibleMessages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-10">
                    {activeChat === 'global'
                      ? 'No messages yet. Say hello to the team!'
                      : 'No messages yet. Start the conversation.'}
                  </div>
                ) : (
                  visibleMessages.map((m, idx) => {
                    const mine = m.sender_id === myId;
                    const prev = visibleMessages[idx - 1];
                    const showHeader =
                      !prev || prev.sender_id !== m.sender_id;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'flex flex-col',
                          mine ? 'items-end' : 'items-start'
                        )}
                      >
                        {showHeader && !mine && activeChat === 'global' && (
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

            <div className="border-t p-3 flex items-end gap-2 shrink-0">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  activeChat === 'global'
                    ? 'Message everyone…'
                    : `Message ${activePeerName}…`
                }
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
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default StaffChat;
