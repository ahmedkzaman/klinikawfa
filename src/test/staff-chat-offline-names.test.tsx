import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

beforeAll(() => {
  // jsdom lacks the DOM/realtime APIs StaffChat touches.
  Element.prototype.scrollIntoView = vi.fn();
});

const myName = 'Ahmed bin Kamarulzaman';

type Msg = {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string | null;
  content: string;
  created_at: string;
};

let scripted: Msg[] = [];
let profileRows: Array<{ id: string; full_name: string; email: string }> = [];

vi.mock('@/integrations/supabase/client', () => {
  const mk = (rows: unknown[] = []) => {
    const p = Promise.resolve({ data: rows, error: null });
    const b: Record<string, unknown> = {};
    for (const k of ['select','order','limit','eq','in','update','insert','delete','throwOnError']) b[k] = vi.fn(() => b);
    b.single = vi.fn(() => p);
    b.maybeSingle = vi.fn(() => p);
    b.then = p.then.bind(p);
    b.catch = p.catch.bind(p);
    b.finally = p.finally.bind(p);
    return b;
  };
  const insertHandlers: Array<(payload: unknown) => void> = [];
  const channel: Record<string, unknown> = {
    on: vi.fn((event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      if (event === 'postgres_changes') insertHandlers.push(cb);
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => { setTimeout(() => cb('SUBSCRIBED'), 0); return channel; }),
    untrack: vi.fn(async () => 'ok'),
    track: vi.fn(async () => 'ok'),
    send: vi.fn(async () => 'ok'),
    presenceState: vi.fn(() => ({})),
  };
  (globalThis as unknown as { __insertHandlers?: typeof insertHandlers }).__insertHandlers = insertHandlers;
  return {
    supabase: {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn((t: string) =>
        mk(
          t === 'staff_messages'
            ? scripted
            : t === 'profiles'
              ? profileRows
              : [],
        )
      ),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => 'ok'),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'ahmed-1' } } })) },
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ role: 'special_admin', user: { id: 'ahmed-1', email: 'a@t.l' }, isLocum: false, isDoctorAdmin: false })),
}));

import { StaffChat } from '@/components/staff/chat/StaffChat';

function openChat() {
  return (async () => {
    render(<StaffChat />);
    const trigger = await screen.findByRole('button', { name: /open staff chat/i });
    fireEvent.click(trigger);
    await screen.findAllByText('Global Room');
  })();
}

describe('StaffChat offline peer names', () => {
  it('retries the profile lookup after a failed first attempt', async () => {
    scripted = [
      { id: 'm1', sender_id: 'ahmed-1', sender_name: myName, receiver_id: 'ammar-1', content: 'dah register pt?', created_at: '2026-08-30T10:05:00Z' },
    ];
    profileRows = []; // first lookup returns nothing (transient failure)
    await openChat();
    await waitFor(
      () => expect(screen.getByText('Direct message')).toBeInTheDocument(),
      { timeout: 5000 },
    );
    // A new message arrives via realtime -> messages change -> lookup retried.
    profileRows = [{ id: 'ammar-1', full_name: 'Muhammad Ammar Harith', email: 'ammar@t.l' }];
    const handlers = (globalThis as unknown as { __insertHandlers?: Array<(p: unknown) => void> }).__insertHandlers ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) {
      h({ new: { id: 'm2', sender_id: 'ahmed-1', sender_name: myName, receiver_id: 'ammar-1', content: 'tolong register pt tu dalam remedi', created_at: '2026-08-30T10:06:00Z' } });
    }
    await waitFor(
      () => expect(screen.getByText('Muhammad Ammar Harith')).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 20000);

  it('never labels an offline peer with my own sender name', async () => {
    // I sent this DM, so the row's sender_name is MY name. The sidebar entry
    // for the offline recipient must come from the profiles lookup, never
    // from sender_name.
    scripted = [
      { id: 'm1', sender_id: 'ahmed-1', sender_name: myName, receiver_id: 'ammar-1', content: 'dah register pt?', created_at: '2026-08-30T10:05:00Z' },
    ];
    profileRows = [{ id: 'ammar-1', full_name: 'Muhammad Ammar Harith', email: 'ammar@t.l' }];
    await openChat();
    // ammar's profile resolves -> sidebar shows HIS name
    await waitFor(
      () => expect(screen.getByText('Muhammad Ammar Harith')).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(myName)).not.toBeInTheDocument();
  }, 20000);

  it('shows the peer name when the peer sent the message', async () => {
    scripted = [
      { id: 'm3', sender_id: 'ammar-1', sender_name: 'Muhammad Ammar Harith', receiver_id: 'ahmed-1', content: 'salam', created_at: '2026-08-30T11:00:00Z' },
    ];
    profileRows = [{ id: 'ammar-1', full_name: 'Muhammad Ammar Harith', email: 'ammar@t.l' }];
    await openChat();
    await waitFor(
      () => expect(screen.getByText('Muhammad Ammar Harith')).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 20000);
});
