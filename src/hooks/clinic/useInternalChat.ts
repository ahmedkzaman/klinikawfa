import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type AppRole } from '@/contexts/AuthContext';

export type OnlineUser = {
  user_id: string;
  full_name: string;
  role: AppRole | null;
};

export type InternalMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  pending?: boolean;
};

const PRESENCE_CHANNEL = 'clinic-presence';

/**
 * Synthesize a soft "ding" via Web Audio API. No assets required.
 * Silently no-ops if the browser blocks audio (autoplay policy, etc.).
 */
export function playNotificationSound() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Browser blocked audio (no user interaction yet) — fail silently.
  }
}

/**
 * Realtime presence (who is online) + per-user unread counts.
 * Mount once at the layout level via <InternalMessenger />.
 */
export function useInternalChat() {
  const { user, role } = useAuth();
  const myId = user?.id ?? null;

  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});
  const [myFullName, setMyFullName] = useState<string>('');

  // Load own display name for presence payload
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
        setMyFullName(data?.full_name || data?.email || 'Staff');
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  // Presence channel
  useEffect(() => {
    if (!myId || !role || role === 'guest') return;
    const payload: OnlineUser = {
      user_id: myId,
      full_name: myFullName || 'Staff',
      role,
    };
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: myId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<OnlineUser>();
        const flat: OnlineUser[] = [];
        const seen = new Set<string>();
        for (const arr of Object.values(state)) {
          for (const p of arr) {
            if (p && p.user_id && !seen.has(p.user_id)) {
              seen.add(p.user_id);
              flat.push(p);
            }
          }
        }
        setOnlineUsers(flat);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(payload);
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [myId, role, myFullName]);

  // Initial unread counts
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    supabase
      .from('internal_messages')
      .select('sender_id')
      .eq('receiver_id', myId)
      .eq('is_read', false)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, number> = {};
        for (const row of data) {
          map[row.sender_id] = (map[row.sender_id] ?? 0) + 1;
        }
        setUnreadBySender(map);
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  // Realtime: increment unread on incoming INSERT
  useEffect(() => {
    if (!myId) return;
    const ch = supabase
      .channel(`im-inbox-${myId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
          filter: `receiver_id=eq.${myId}`,
        },
        (payload) => {
          const row = payload.new as InternalMessage;
          setUnreadBySender((prev) => ({
            ...prev,
            [row.sender_id]: (prev[row.sender_id] ?? 0) + 1,
          }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId]);

  const totalUnread = useMemo(
    () => Object.values(unreadBySender).reduce((a, b) => a + b, 0),
    [unreadBySender]
  );

  const clearUnreadFor = useCallback((peerId: string) => {
    setUnreadBySender((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (receiverId: string, content: string) => {
      if (!myId) return { error: new Error('not_authenticated') };
      const trimmed = content.trim();
      if (!trimmed) return { error: new Error('empty') };
      const { error } = await supabase
        .from('internal_messages')
        .insert({ sender_id: myId, receiver_id: receiverId, content: trimmed });
      return { error };
    },
    [myId]
  );

  return {
    myId,
    onlineUsers: onlineUsers.filter((u) => u.user_id !== myId),
    unreadBySender,
    totalUnread,
    sendMessage,
    clearUnreadFor,
  };
}

/**
 * Thread of messages between me and a single peer.
 */
export function useChatThread(peerId: string | null) {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const peerRef = useRef<string | null>(null);
  peerRef.current = peerId;

  // Fetch history
  useEffect(() => {
    if (!myId || !peerId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('internal_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${myId})`
      )
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data ?? []) as InternalMessage[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myId, peerId]);

  // Realtime appends for this thread (both directions)
  useEffect(() => {
    if (!myId || !peerId) return;
    const ch = supabase
      .channel(`im-thread-${myId}-${peerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_messages' },
        (payload) => {
          const row = payload.new as InternalMessage;
          const involvesPair =
            (row.sender_id === myId && row.receiver_id === peerId) ||
            (row.sender_id === peerId && row.receiver_id === myId);
          if (!involvesPair) return;
          setMessages((prev) => {
            // Replace optimistic pending row if echo matches
            const idx = prev.findIndex(
              (m) =>
                m.pending &&
                m.sender_id === row.sender_id &&
                m.receiver_id === row.receiver_id &&
                m.content === row.content
            );
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = row;
              return next;
            }
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, peerId]);

  // Mark unread as read when thread is open
  useEffect(() => {
    if (!myId || !peerId) return;
    supabase
      .from('internal_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('receiver_id', myId)
      .eq('sender_id', peerId)
      .eq('is_read', false)
      .then(() => {});
  }, [myId, peerId, messages.length]);

  const appendOptimistic = useCallback(
    (content: string) => {
      if (!myId || !peerId) return;
      const optimistic: InternalMessage = {
        id: `pending-${Date.now()}-${Math.random()}`,
        sender_id: myId,
        receiver_id: peerId,
        content: content.trim(),
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
    },
    [myId, peerId]
  );

  return { messages, loading, appendOptimistic };
}
