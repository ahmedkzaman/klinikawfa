import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  maybeSingle: vi.fn(async () => ({
    data: { full_name: 'Dr Awfa', email: 'doctor@klinikawfa.com' },
  })),
};

let realtimeInsertHandler: ((payload: { new: typeof insertedMessage }) => void) | null = null;

const channel = {
  on: vi.fn((event: string, config: unknown, callback?: typeof realtimeInsertHandler) => {
    if (event === 'postgres_changes' && callback) realtimeInsertHandler = callback;
    return channel;
  }),
  subscribe: vi.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
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
    removeChannel: vi.fn(),
  },
}));

import { StaffChat } from '@/components/staff/chat/StaffChat';

describe('StaffChat sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeInsertHandler = null;
    Element.prototype.scrollIntoView = vi.fn();
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
});
