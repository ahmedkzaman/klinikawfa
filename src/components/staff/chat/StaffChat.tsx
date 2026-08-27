import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
let chatAudioContext: AudioContext | null = null;

// --- Channel lifecycle serialization ----------------------------------------
// supabase.channel(topic) returns the EXISTING instance while a previous copy
// is still tearing down: removeChannel() only finishes after the server
// acknowledges the leave, and subscribe() on a not-yet-closed channel is
// silently ignored. <StaffChat /> remounts whenever the user switches between
// the staff and clinic portals (both layouts render it), so a fast remount
// could otherwise latch onto a half-dead channel and lose chat + presence
// until a full page reload. Serializing create/dispose per topic guarantees
// every new subscriber starts from a genuinely fresh channel.
const channelOps = new Map<string, Promise<unknown>>();

function enqueueChannelOp<T>(topic: string, op: () => T): Promise<T> {
  const previous = channelOps.get(topic) ?? Promise.resolve();
  const run = previous.then(op, op);
  channelOps.set(
    topic,
    run.catch(() => {
      // Keep the chain alive regardless of individual operation failures.
    })
  );
  return run;
}

function acquireChannel(
  topic: string,
  config?: Parameters<typeof supabase.channel>[1]
) {
  return enqueueChannelOp(topic, () => supabase.channel(topic, config));
}

function releaseChannel(
  topic: string,
  room: ReturnType<typeof supabase.channel>
) {
  return enqueueChannelOp(topic, () =>
    Promise.resolve(supabase.removeChannel(room)).catch(() => {
      // Best-effort teardown; a failed leave must not stall future mounts.
    })
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getChatAudioContext() {
  if (chatAudioContext) return chatAudioContext;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  chatAudioContext = new Ctx();
  return chatAudioContext;
}

function unlockChatSound() {
  try {
    const ctx = getChatAudioContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  } catch {
    // Audio is optional; browsers without Web Audio can continue normally.
  }
}

function playIncomingChirp() {
  try {
    const ctx = getChatAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const pattern = [1568, 1976, 2349];
    pattern.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = now + i * 0.1;
      const end = start + 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.45, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  } catch {
    // Audio is optional; chat delivery must never depend on it.
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
  const [readThrough, setReadThrough] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  const activeChatRef = useRef<ActiveChat>(activeChat);
  const myIdRef = useRef<string | null>(null);
  const initialLoadedRef = useRef(false);
  // Presence must not depend on displayName: it loads asynchronously, and a
  // dep flip here tears down + rebuilds the presence channel seconds after
  // mount (leave/join storm visible to everyone else). Track via ref instead.
  const displayNameRef = useRef<string>('Staff');
  const presenceRoomRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceSubscribedRef = useRef(false);
  // Resolved names for DM peers seen in history who are not currently online.
  const [peerNames, setPeerNames] = useState<Record<string, string | null>>({});
  // Peers whose profile lookup was already issued (or exhausted). Without
  // this, a lookup that yields no row re-runs forever: the effect would see
  // "peer still unresolved", query again, and merge an unchanged-but-new
  // peerNames object each cycle — an invisible CPU spin in production.
  const peerLookupsRef = useRef<Set<string>>(new Set());

  const myId = user?.id ?? null;
  const eligible = !!myId && !!role && role !== 'guest';

  const readStorageKey = myId ? `klinikawfa-staff-chat-read:${myId}` : null;

  useEffect(() => {
    if (!readStorageKey) return;
    try {
      const saved = window.localStorage.getItem(readStorageKey);
      if (saved) setReadThrough(JSON.parse(saved) as Record<string, string>);
    } catch {
      setReadThrough({});
    }
  }, [readStorageKey]);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Browsers allow notification audio after the first user gesture.
  useEffect(() => {
    if (!eligible) return;
    const unlock = () => unlockChatSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [eligible]);

  // Reset unread when opening
  useEffect(() => {
    if (open) setUnreadCount(0);
  }, [open, activeChat]);

  useEffect(() => {
    if (!open || !readStorageKey) return;
    const readAt = new Date().toISOString();
    setReadThrough((previous) => {
      const next = { ...previous, [activeChat]: readAt };
      window.localStorage.setItem(readStorageKey, JSON.stringify(next));
      return next;
    });
  }, [open, activeChat, readStorageKey]);

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

  // History loader — separate from mount so it can be re-run whenever the
  // sheet is opened. Realtime alone is not enough: if the tab slept or the
  // socket dropped, INSERT events are lost forever and messages "disappear".
  const loadHistory = useCallback(async () => {
    if (!myIdRef.current) return;
    try {
      const { data, error } = await supabase
        .from('staff_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (error) {
        console.error('Failed to load staff messages', error);
        return;
      }
      setMessages(((data ?? []) as StaffMessage[]).slice().reverse());
    } finally {
      setLoading(false);
    }
  }, []);

  // History + realtime subscription
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setLoading(true);
    void loadHistory();

    void acquireChannel(CHAT_CHANNEL).then((ch) => {
      if (cancelled) {
        // Component unmounted while we were waiting for the channel; release it.
        void releaseChannel(CHAT_CHANNEL, ch);
        return;
      }
      channel = ch;
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_messages' },
        (payload) => {
          const row = payload.new as StaffMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          const meId = myIdRef.current;
          if (!meId || row.sender_id === meId) return;
          // Determine which chat this message belongs to
          const chatKey: ActiveChat = row.receiver_id === null ? 'global' : row.sender_id;
          const isViewing = openRef.current && activeChatRef.current === chatKey;
          playIncomingChirp();
          if (!isViewing) {
            setUnreadCount((c) => c + 1);
          }
        }
      ).subscribe((status) => {
        // After any reconnect (sleep/wake, network switch), pull fresh history.
        // Realtime INSERT streams are not replayed by the server, so anything
        // sent while offline would otherwise never appear until a full reload.
        if (!cancelled && status === 'SUBSCRIBED') void loadHistory();
      });
    });

    return () => {
      cancelled = true;
      if (channel) void releaseChannel(CHAT_CHANNEL, channel);
    };
  }, [eligible, loadHistory]);

  // Presence
  useEffect(() => {
    if (!eligible || !myId) return;
    let cancelled = false;
    let room: ReturnType<typeof supabase.channel> | null = null;

    const compute = () => {
      const state = room?.presenceState<OnlineUser>() ?? {};
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

    void acquireChannel(PRESENCE_CHANNEL, {
      config: { presence: { key: myId } },
    }).then((ch) => {
      if (cancelled) {
        void releaseChannel(PRESENCE_CHANNEL, ch);
        return;
      }
      room = ch;
      presenceRoomRef.current = ch;
      presenceSubscribedRef.current = false;

      ch
        .on('presence', { event: 'sync' }, compute)
        .on('presence', { event: 'join' }, compute)
        .on('presence', { event: 'leave' }, compute)
        .subscribe((status) => {
          // Re-track on EVERY (re)subscribe, not just the first. After a socket
          // drop the server has discarded our presence metadata; the channel
          // auto-rejoins, but without re-tracking we stay invisible to everyone
          // else even though we can see them — which was the original symptom.
          if (status === 'SUBSCRIBED') {
            presenceSubscribedRef.current = true;
            void ch.track({
              user_id: myId,
              name: displayNameRef.current || 'Staff',
              online_at: new Date().toISOString(),
            });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            presenceSubscribedRef.current = false;
          }
        });
    });

    return () => {
      cancelled = true;
      presenceRoomRef.current = null;
      presenceSubscribedRef.current = false;
      if (room) {
        room.untrack().catch(() => {});
        void releaseChannel(PRESENCE_CHANNEL, room);
      }
    };
  }, [eligible, myId]);

  // Re-track with the real display name once the profile loads (initial
  // track happens with the placeholder 'Staff').
  useEffect(() => {
    if (!eligible || !myId || !displayName || displayName === 'Staff') return;
    const room = presenceRoomRef.current;
    if (!room || !presenceSubscribedRef.current) return;
    room
      .track({
        user_id: myId,
        name: displayName,
        online_at: new Date().toISOString(),
      })
      .catch(() => {});
  }, [eligible, myId, displayName]);

  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((u) => u.user_id)),
    [onlineUsers]
  );

  // Refetch history whenever the sheet is opened. If the tab slept while the
  // sheet was closed, realtime INSERTs were missed; opening should reconcile.
  useEffect(() => {
    if (open) void loadHistory();
  }, [open, loadHistory]);

  // Refetch history when the user returns to this tab. Background tabs get
  // their timers throttled and their sockets silently killed by the browser;
  // the realtime SUBSCRIBED refetch only fires once the socket actually
  // reconnects, so an immediate query on visibility closes the gap.
  useEffect(() => {
    if (!eligible) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadHistory();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [eligible, loadHistory]);

  // Resolve display names for DM peers seen in history but not currently
  // online, so the sidebar can still list the conversation. The sidebar
  // otherwise only shows online users, making offline DM threads invisible.
  //
  // Each peer is looked up AT MOST ONCE per component lifetime: the pending
  // set is reserved before the request leaves. A merge that produced no
  // change returns the previous object so its reference stays stable — the
  // combination prevents an update→re-run→update microtask pump that used to
  // spin forever whenever a peer's profile row was missing or unreadable.
  useEffect(() => {
    if (!myId) return;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      const peerId = m.sender_id === myId ? m.receiver_id : m.sender_id;
      if (
        peerId &&
        !seen.has(peerId) &&
        !onlineUserIds.has(peerId) &&
        !peerLookupsRef.current.has(peerId)
      ) {
        seen.add(peerId);
        ids.push(peerId);
      }
    }
    if (ids.length === 0) return;
    for (const id of ids) peerLookupsRef.current.add(id);
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = data ?? [];
        if (rows.length === 0) return;
        setPeerNames((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const row of rows) {
            const name = row.full_name || row.email || null;
            if (next[row.id] !== name) {
              next[row.id] = name;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [messages, myId, onlineUserIds]);

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
    const { data, error } = await supabase
      .from('staff_messages')
      .insert({
        sender_id: myId,
        sender_name: displayName,
        content: text,
        receiver_id: activeChat === 'global' ? null : activeChat,
      })
      .select('*')
      .single();
    setSending(false);
    if (error) {
      toast.error('Failed to send message');
      return;
    }
    setMessages((prev) =>
      prev.some((message) => message.id === data.id)
        ? prev
        : [...prev, data as StaffMessage]
    );
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
      const readAt = readThrough[key];
      if (readAt && m.created_at <= readAt) continue;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [messages, myId, activeChat, readThrough]);

  const peers = useMemo(
    () => onlineUsers.filter((u) => u.user_id !== myId),
    [onlineUsers, myId]
  );

  // DM conversations from history with users who are not currently online.
  const offlinePeers = useMemo(() => {
    if (!myId) return [];
    const map = new Map<string, { user_id: string; name: string; online: false }>();
    for (const m of messages) {
      if (m.receiver_id === null) continue;
      const peerId = m.sender_id === myId ? m.receiver_id : m.sender_id;
      if (peerId === myId || map.has(peerId) || onlineUserIds.has(peerId)) continue;
      const name = peerNames[peerId] ?? m.sender_name;
      map.set(peerId, { user_id: peerId, name, online: false });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [messages, myId, onlineUserIds, peerNames]);

  const activePeer =
    activeChat === 'global'
      ? null
      : peers.find((p) => p.user_id === activeChat) ??
        offlinePeers.find((p) => p.user_id === activeChat) ??
        null;
  const activePeerName =
    activeChat === 'global'
      ? 'Global Room'
      : activePeer?.name ??
        messages.find((m) => m.sender_id === activeChat)?.sender_name ??
        peerNames[activeChat] ??
        'Direct message';

  if (!eligible) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) unlockChatSound();
        setOpen(nextOpen);
      }}
    >
      <SheetTrigger asChild>
        <Button
          size="icon"
          className={cn(
            "fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-14 w-14 rounded-full shadow-xl bg-blue-600 hover:bg-blue-700 text-white",
            unreadCount > 0 && !open && "animate-bounce"
          )}
          aria-label="Open staff chat"
        >
          <MessageSquare className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
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

                {peers.length === 0 && offlinePeers.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No one else online.
                  </div>
                ) : (
                  <>
                    {peers.map((u) => {
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
                    })}
                    {offlinePeers.length > 0 && (
                      <>
                        <div className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          Offline
                        </div>
                        {offlinePeers.map((u) => {
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
                              <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                              <span className="flex-1 truncate">{u.name}</span>
                              {unread > 0 && (
                                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                                  {unread}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </>
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
