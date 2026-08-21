import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authListener: null as null | ((event: string, session: unknown) => void),
  getSession: vi.fn(),
  removeQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  cancelQueries: vi.fn(),
  unsubscribe: vi.fn(),
  rpc: vi.fn(),
  role: 'admin',
}));

vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
  useQueryClient: () => ({
    removeQueries: state.removeQueries,
    invalidateQueries: state.invalidateQueries,
    cancelQueries: state.cancelQueries,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: state.getSession,
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        state.authListener = listener;
        return { data: { subscription: { unsubscribe: state.unsubscribe } } };
      },
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: state.role }, error: null }),
        }),
      }),
    }),
    rpc: state.rpc,
  },
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

/**
 * Mirrors ClinicProtectedRoute's gate: while any access-loading flag is true
 * the guarded page is replaced by a spinner ("blocked").
 */
function GuardedRouteProbe() {
  const {
    rolesLoading,
    insightAccessLoading,
    managementDashboardAccessLoading,
    role,
    user,
  } = useAuth();
  if (rolesLoading || insightAccessLoading || managementDashboardAccessLoading) {
    return <output aria-label="Guarded route">blocked-spinner</output>;
  }
  return <output aria-label="Guarded route">mounted-{role}-{user?.id}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function session(userId: string) {
  return {
    access_token: `token-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId },
  };
}

describe('AuthProvider visibility refocus keeps guarded routes mounted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authListener = null;
    state.cancelQueries.mockResolvedValue(undefined);
    state.invalidateQueries.mockResolvedValue(undefined);
    state.getSession.mockResolvedValue({ data: { session: session('account-a') } });
    state.role = 'admin';
    state.rpc.mockImplementation(async (fn: string) => fn === 'get_insight_viewer_scope'
      ? {
          data: { allowed: false, role: 'admin', doctor_id: null, permission_version: 'v1' },
          error: null,
        }
      : { data: false, error: null });
  });

  it('does not block the guarded route when the tab becomes visible again', async () => {
    render(
      <AuthProvider>
        <GuardedRouteProbe />
      </AuthProvider>,
    );

    // Initial load completes: the guarded route mounts.
    await waitFor(() => expect(screen.getByLabelText('Guarded route')).toHaveTextContent('mounted-admin-account-a'));

    // The refocus refresh hangs forever, like a slow RPC on a flaky connection.
    const never = deferred<{ data: object; error: null }>();
    state.rpc.mockImplementation((fn: string) => {
      if (fn === 'get_insight_viewer_scope') return never.promise;
      return Promise.resolve({ data: false, error: null });
    });

    // User switches to another browser tab and comes back.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // The guarded page must STAY mounted — no spinner, no remount.
    expect(screen.getByLabelText('Guarded route')).toHaveTextContent('mounted-admin-account-a');

    // The access refresh is still issued in the background.
    expect(state.rpc).toHaveBeenCalledWith('get_insight_viewer_scope');
    expect(state.removeQueries).toHaveBeenCalled();
  });

  it('still fails closed on an explicit clinic-permission change event', async () => {
    render(
      <AuthProvider>
        <GuardedRouteProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('Guarded route')).toHaveTextContent('mounted-admin-account-a'));

    const never = deferred<{ data: object; error: null }>();
    state.rpc.mockImplementation(() => never.promise);

    act(() => {
      window.dispatchEvent(new Event('clinic-permissions-changed'));
    });

    // Permission change must block the guarded route until the refresh lands.
    expect(screen.getByLabelText('Guarded route')).toHaveTextContent('blocked-spinner');
  });
});
