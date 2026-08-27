import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertedMessage = {
  id: 'message-1',
  sender_id: 'user-1',
  sender_name: 'Dr Awfa',
  receiver_id: null,
  content: 'Kaunter dua sila ambil perhatian',
  created_at: '2026-07-28T07:30:00.000Z',
};

const insertSingle = vi.fn(async () => ({ data: insertedMessage, error: null }));
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insertQuery = {
  select: insertSelect,
  then: (
    resolve: (value: { data: null; error: null }) => unknown,
  ) => Promise.resolve({ data: null, error: null }).then(resolve),
};
const insert = vi.fn(() => insertQuery);

const historyQuery = {
  select: vi.fn(() => historyQuery),
  order: vi.fn(() => historyQuery),
  limit: vi.fn(async () => ({ data: [], error: null })),
};

const profileQuery = {
  select: vi.fn(() => profileQuery),
  eq: vi.fn(() => profileQuery),
  in: vi.fn(() => profileQuery),
  maybeSingle: vi.fn(async () => ({
    data: { full_name: 'Dr Awfa', email: 'doctor@klinikawfa.com' },
  })),
  then: vi.fn(
    (resolve: (value: { data: unknown[] | null }) => unknown) =>
      Promise.resolve({ data: [] }).then(resolve),
  ),
};

let realtimeInsertHandler: ((payload: { new: typeof insertedMessage }) => void) | null = null;

const channel = {
  on: vi.fn((event: string, config: unknown, callback?: typeof realtimeInsertHandler) => {
    if (event === 'postgres_changes' && callback) realtimeInsertHandler = callback;
    return channel;
  }),
  // The real client acks SUBSCRIBED asynchronously off the websocket. A
  // synchronous callback here welds the ack onto the channel-acquire
  // microtask, which (with sync promise mocks) cascades state updates that
  // starve even setTimeout — the exact storm this suite used to die of.
  subscribe: vi.fn((callback?: (status: string) => void) => {
    if (callback) setTimeout(() => callback('SUBSCRIBED'), 0);
    return channel;
  }),
  track: vi.fn(async () => undefined),
  untrack: vi.fn(async () => undefined),
  presenceState: vi.fn(() => ({})),
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'doctor@klinikawfa.com' },
    role: 'resident_doctor',
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery;
      if (table === 'staff_messages') {
        return { ...historyQuery, insert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  },
}));

import { StaffChat } from '@/components/staff/chat/StaffChat';

describe('StaffChat sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeInsertHandler = null;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(async () => {
    // Drain pending microtasks and timers so channel-op promises resolve
    // inside the test boundary rather than after worker teardown.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('shows a successfully saved message without waiting for a realtime echo', async () => {
    render(<StaffChat />);

    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));
    const input = await screen.findByPlaceholderText(/message everyone/i);
    fireEvent.change(input, {
      target: { value: 'Kaunter dua sila ambil perhatian' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Kaunter dua sila ambil perhatian')).toBeInTheDocument();
    });
  });

  it('chirps for an incoming message even while its chat is open', async () => {
    const oscillatorStart = vi.fn();
    const audioContext = {
      currentTime: 1,
      state: 'running',
      destination: {},
      resume: vi.fn(async () => undefined),
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
    };
    window.AudioContext = vi.fn(() => audioContext) as unknown as typeof AudioContext;

    render(<StaffChat />);
    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));

    await waitFor(() => expect(realtimeInsertHandler).not.toBeNull());
    realtimeInsertHandler?.({
      new: {
        ...insertedMessage,
        id: 'incoming-1',
        sender_id: 'user-2',
        sender_name: 'Nurse Awfa',
      },
    });

    expect(oscillatorStart).toHaveBeenCalledTimes(3);
  });

  it('refetches message history when the sheet is opened', async () => {
    render(<StaffChat />);

    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));
    await screen.findByPlaceholderText(/message everyone/i);

    // Initial mount + realtime SUBSCRIBED both load history; the sheet being
    // opened must trigger one more fetch.
    const before = (historyQuery.limit as Mock).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/message everyone/i)).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));
    await screen.findByPlaceholderText(/message everyone/i);
    await waitFor(() =>
      expect((historyQuery.limit as Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('survives a remount (channel lifecycle race) and still delivers a realtime insert', async () => {
    // Regression: supabase.channel(topic) returns the existing instance while
    // a previous copy is mid-teardown, and subscribe() on a not-yet-closed
    // channel is silently ignored. StaffChat serializes create/dispose per
    // topic; a fast unmount→remount (staff/clinic portal switch) must still
    // deliver messages on the fresh subscription.
    const { unmount } = render(<StaffChat />);
    // Let the first mount finish acquiring its channels before tearing down,
    // mirroring a real (fast) portal switch rather than a hypothetical
    // mid-microtask cancel that jsdom teardown cannot model safely.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    render(<StaffChat />);
    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));
    await waitFor(() => expect(realtimeInsertHandler).not.toBeNull());

    realtimeInsertHandler?.({
      new: {
        ...insertedMessage,
        id: 'remount-1',
        sender_id: 'user-2',
        sender_name: 'Nurse Awfa',
        content: 'after remount',
      },
    });

    await waitFor(() =>
      expect(screen.getByText('after remount')).toBeInTheDocument(),
    );
  });

  it('re-tracks presence after a socket reconnect', async () => {
    // Regression: after a CHANNEL_ERROR→SUBSCRIBED cycle, the server has
    // discarded our presence metadata. Without re-tracking on every
    // SUBSCRIBED (not just the first), the user stays invisible to everyone
    // else even though they can see others — the original symptom.
    render(<StaffChat />);
    await waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    // Let the display-name profile lookup settle too — it also re-tracks once
    // when the real name arrives, so compare against a delta, not an absolute.
    await waitFor(() =>
      expect(
        (channel.track as Mock).mock.calls.some((call) =>
          (call[0] as { name?: string }).name === 'Dr Awfa',
        ),
      ).toBe(true),
    );

    const subscribeCb = (channel.subscribe as Mock).mock.calls.at(-1)?.[0];
    expect(subscribeCb).toBeTypeOf('function');
    const before = (channel.track as Mock).mock.calls.length;

    // Simulate a socket drop then reconnect
    subscribeCb('CHANNEL_ERROR');
    subscribeCb('SUBSCRIBED');

    // Reconnected → track called again (presence re-announced)
    await waitFor(() =>
      expect((channel.track as Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('does not re-query profiles repeatedly for an unresolvable DM peer', async () => {
    // Regression: a DM from a peer with no profile row used to trigger an
    // infinite query→setState→re-render pump (the lookup gate keyed off the
    // peerNames object it was merging into, so a merge that changed nothing
    // still scheduled another effect run). Lookups are now issued at most
    // once per peer per component lifetime.
    (profileQuery.then as Mock).mockImplementation(
      (resolve: (value: { data: unknown[] }) => unknown) =>
        Promise.resolve({ data: [] }).then(resolve),
    );

    render(<StaffChat />);
    fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));

    await waitFor(() => expect(realtimeInsertHandler).not.toBeNull());
    // Settle the mount-time + SUBSCRIBED refetches before firing the insert,
    // so the late history response cannot overwrite the appended message.
    await new Promise((resolve) => setTimeout(resolve, 100));

    realtimeInsertHandler?.({
      new: {
        ...insertedMessage,
        id: 'dm-unresolved-1',
        sender_id: 'user-2',
        sender_name: 'Nurse Awfa',
        receiver_id: 'user-1',
        content: 'dm from peer without profile row',
      },
    });

    // The peer is offline and has no profile row: they must still show up in
    // the sidebar (falling back to the message's sender_name) so the thread
    // stays reachable — open it and confirm the DM renders.
    const peerButton = await screen.findByRole('button', { name: /nurse awfa/i });
    fireEvent.click(peerButton);
    await screen.findByText('dm from peer without profile row');

    // Give any pathological loop a generous window to make itself visible.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const before = (historyQuery.limit as Mock).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The SUBSCRIBED refetch is one-shot per subscription; anything beyond
    // noise-free here means an effect is still pumping.
    expect((historyQuery.limit as Mock).mock.calls.length).toBe(before);
  });

  it('lists an offline DM peer from history so their thread stays reachable', async () => {
    // History contains a DM with a peer who is not in presence state.
    // Persistent implementation: history is refetched on mount, on
    // SUBSCRIBED, and on sheet open — all of them must keep returning it.
    const dmMessage = {
      id: 'dm-1',
      sender_id: 'user-1',
      sender_name: 'Dr Awfa',
      receiver_id: 'user-2',
      content: 'please register pt tu',
      created_at: '2026-08-27T02:25:44.285912+00:00',
    };
    (historyQuery.limit as Mock).mockImplementation(async () => ({
      data: [dmMessage],
      error: null,
    }));
    (profileQuery.then as Mock).mockImplementation(
      (resolve: (value: { data: unknown[] }) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: 'user-2',
              full_name: 'MUHAMMAD SHAHRUL AIMAN BIN SHAHRIZALLUDDIN',
              email: 'shahrul@klinikawfa.com',
            },
          ],
        }).then(resolve),
    );

    try {
      render(<StaffChat />);
      fireEvent.click(screen.getByRole('button', { name: /open staff chat/i }));

      const peerButton = await screen.findByRole('button', {
        name: /muhammad shahrul/i,
      });
      fireEvent.click(peerButton);
      await screen.findByText('please register pt tu');
    } finally {
      (historyQuery.limit as Mock).mockImplementation(async () => ({
        data: [],
        error: null,
      }));
      (profileQuery.then as Mock).mockImplementation(
        (resolve: (value: { data: unknown[] | null }) => unknown) =>
          Promise.resolve({ data: [] }).then(resolve),
      );
    }
  });
});

type Mock = ReturnType<typeof vi.fn>;

