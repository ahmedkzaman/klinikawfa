import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, MessageCircle, Send, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useChatThread,
  useInternalChat,
  type OnlineUser,
} from '@/hooks/clinic/useInternalChat';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function roleLabel(role: string | null | undefined) {
  if (!role) return 'Staff';
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function InternalMessenger() {
  const { user, role } = useAuth();
  const {
    myId,
    onlineUsers,
    unreadBySender,
    totalUnread,
    sendMessage,
    clearUnreadFor,
  } = useInternalChat();

  const [open, setOpen] = useState(false);
  const [peer, setPeer] = useState<OnlineUser | null>(null);

  // Hide entirely for guests / unauthenticated
  if (!user || !myId || !role || role === 'guest') return null;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-50">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPeer(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size="icon"
            className="relative h-14 w-14 rounded-full shadow-lg"
            aria-label="Open staff messenger"
          >
            <MessageCircle className="h-6 w-6" />
            {totalUnread > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center"
                aria-label={`${totalUnread} unread messages`}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-0 overflow-hidden"
        >
          {peer ? (
            <ChatThreadView
              peer={peer}
              onBack={() => setPeer(null)}
              onSend={async (text) => {
                const { error } = await sendMessage(peer.user_id, text);
                if (error) toast.error('Failed to send message');
              }}
            />
          ) : (
            <StaffListView
              users={onlineUsers}
              unreadBySender={unreadBySender}
              onSelect={(u) => {
                clearUnreadFor(u.user_id);
                setPeer(u);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StaffListView({
  users,
  unreadBySender,
  onSelect,
}: {
  users: OnlineUser[];
  unreadBySender: Record<string, number>;
  onSelect: (u: OnlineUser) => void;
}) {
  return (
    <div className="flex flex-col h-96">
      <div className="px-4 py-3 border-b">
        <div className="text-sm font-semibold">Team chat</div>
        <div className="text-xs text-muted-foreground">
          Online now · {users.length}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {users.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No teammates online right now.
          </div>
        ) : (
          <ul className="divide-y">
            {users.map((u) => {
              const unread = unreadBySender[u.user_id] ?? 0;
              return (
                <li key={u.user_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(u)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs">
                          {initials(u.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {u.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {roleLabel(u.role)}
                      </div>
                    </div>
                    {unread > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                        {unread}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function ChatThreadView({
  peer,
  onBack,
  onSend,
}: {
  peer: OnlineUser;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const { messages, loading, appendOptimistic } = useChatThread(peer.user_id);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    appendOptimistic(text);
    await onSend(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col h-96">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials(peer.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{peer.full_name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            Online · {roleLabel(peer.role)}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {loading && messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-10">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-10">
            Say hello to start the conversation.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.sender_id === myId;
              return (
                <div
                  key={m.id}
                  className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[78%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words',
                      mine
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm',
                      m.pending && 'opacity-70'
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-2 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="resize-none min-h-[36px] max-h-24 text-sm py-2"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
