## Goal
Add a floating realtime internal messenger to the clinic portal with Supabase Presence (only currently-online staff appear) and instant 1:1 chat. Available on every `/clinic/*` page via `ClinicLayout`.

## Naming note
The project uses `public.profiles` (PK = `id` = `auth.users.id`), not `user_profiles`. The messenger will reference `profiles.id` for sender/receiver, joined with `user_roles.role` for the role badge.

## 1. Database (single migration)

**New table `public.internal_messages`**
- `id uuid pk default gen_random_uuid()`
- `sender_id uuid not null references profiles(id) on delete cascade`
- `receiver_id uuid not null references profiles(id) on delete cascade`
- `content text not null check (length(btrim(content)) between 1 and 4000)`
- `is_read boolean not null default false`
- `created_at timestamptz not null default now()`
- `read_at timestamptz`
- Indexes: `(receiver_id, is_read, created_at desc)`, `(sender_id, receiver_id, created_at)`, `(receiver_id, sender_id, created_at)`

**RLS** (enabled)
- `SELECT`: `auth.uid() = sender_id OR auth.uid() = receiver_id`
- `INSERT`: `auth.uid() = sender_id` and sender must be staff/admin/locum (`public.is_staff_or_admin(auth.uid()) OR has_role(auth.uid(),'locum')`) to keep guests out
- `UPDATE`: `auth.uid() = receiver_id` and only the `is_read`/`read_at` columns may change (enforced via a `BEFORE UPDATE` trigger that rejects edits to `content`, `sender_id`, `receiver_id`, `created_at`)
- No `DELETE` policy (messages are immutable for audit).

**Realtime**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;`
- `ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;`

## 2. Hook — `src/hooks/clinic/useInternalChat.ts`

Two concerns, one hook (split into helpers internally):

**Presence**
- Single shared channel `clinic-presence` keyed by `auth.uid()`.
- On mount: `channel.track({ user_id, full_name, role })` after `SUBSCRIBED`.
- Listen to `sync` event → derive `onlineUsers: { user_id, full_name, role }[]` from `channel.presenceState()`.
- Cleanup: `untrack()` + `removeChannel()` on unmount / sign-out.

**Messages**
- `useThread(peerId)` → fetches paginated history for the `(me, peer)` pair, ordered ascending, limit 100; refetches when `peerId` changes.
- Subscribes to `postgres_changes` `INSERT` on `internal_messages` filtered by `receiver_id=eq.${me}` (server filter) + client-side filter on `sender_id` to match the active thread; appends to the list and marks read.
- `unreadCounts`: a second subscription on `INSERT` for `receiver_id=eq.${me}` increments a `Map<senderId, number>` used by the bubble badge and the staff list.
- `sendMessage(receiverId, content)` → trimmed insert; optimistic append with a `pending` flag, reconciled when realtime echoes the row.
- `markThreadRead(peerId)` → `UPDATE … SET is_read=true, read_at=now() WHERE receiver_id=me AND sender_id=peer AND is_read=false`.

## 3. UI — `src/components/clinic/chat/InternalMessenger.tsx`

Floating widget, `fixed bottom-4 right-4 z-50`. All colours via semantic tokens (`bg-primary`, `bg-muted`, `text-primary-foreground`, etc.). Built with shadcn `Popover` + `ScrollArea` + `Input` + `Button` (lucide `MessageCircle`, `ArrowLeft`, `Send`, `Circle`).

Three view states managed by local `useState`:

1. **Closed bubble** — round 56px button, primary background, `MessageCircle` icon. Red dot (`bg-destructive`) when `totalUnread > 0`.
2. **Staff list** — popover card (`w-80`, `h-96`). Header: "Online now · {count}". Body: scrollable list of `onlineUsers` excluding self; each row shows avatar/initials, name, role badge, green `Circle` indicator, and an unread count chip. Empty state: "No teammates online right now."
3. **Chat thread** — same card size; back arrow returns to list. Messages: my messages right-aligned `bg-primary text-primary-foreground`, peer's left-aligned `bg-muted`. Auto-scroll to bottom on new message via `ref.scrollIntoView({ block:'end' })`. Footer: textarea + Send button; Enter sends, Shift+Enter newline; disabled when input empty.

Mobile: same `fixed bottom-20 right-4` (above the `MobileCTABar` 64px spacer) when viewport `< md`.

## 4. Integration — `src/components/clinic/ClinicLayout.tsx`
- Import and render `<InternalMessenger />` once, inside the layout shell (after `<main>`, before closing wrapper) so it appears on every `/clinic/*` route.
- Render conditionally: skip for `guest` and for unauthenticated users (the layout already gates on `any_staff`, but defensive `if (!user) return null` inside the component too).

## 5. Out of scope (explicit)
- No group chats, no file attachments, no typing indicators, no message edit/delete.
- No notifications outside the clinic portal (staff portal `/staff/*` not in scope this round).
- No push notifications; in-app only while the tab is open.
- No archiving / soft-delete of threads.

## 6. Verification
- Two browsers / accounts (e.g. an admin and a staff) both on `/clinic/*` → each sees the other in the online list, the third logged-out account does not appear.
- Sending a message: receiver's bubble shows red dot within ~1s; opening the thread clears the dot and flips `is_read=true`.
- Closing one browser tab → that user disappears from the other's online list within ~5s (Supabase presence timeout).
- Direct `SELECT` from `internal_messages` as an unrelated third user returns 0 rows (RLS).
- `UPDATE … SET content='x'` by the receiver is rejected by the trigger.