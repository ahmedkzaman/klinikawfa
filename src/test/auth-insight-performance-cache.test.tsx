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

function InsightScopeProbe() {
  const auth = useAuth();
  return (
    <output aria-label="Insight viewer scope">
      loading={String(auth.insightAccessLoading)};
      allowed={String(auth.canViewInsights)};
      role={auth.role ?? 'none'};
      doctor={auth.insightDoctorId ?? 'none'};
      version={auth.insightPermissionVersion}
    </output>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function InsightSourceProbe() {
  const auth = useAuth();
  if (auth.insightAccessLoading || !auth.canViewInsights) return <output aria-label="Insight source guard">blocked</output>;
  return <output aria-label="Insight source guard">mounted-for-{auth.user?.id}</output>;
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

describe('AuthProvider Insight performance cache isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authListener = null;
    state.cancelQueries.mockResolvedValue(undefined);
    state.invalidateQueries.mockResolvedValue(undefined);
    state.getSession.mockResolvedValue({ data: { session: session('account-a') } });
    state.role = 'admin';
    state.rpc.mockImplementation(async (fn: string) => fn === 'get_insight_viewer_scope'
      ? {
          data: {
            allowed: false,
            role: 'admin',
            doctor_id: null,
            permission_version: 'admin:override-denied-v1',
          },
          error: null,
        }
      : { data: false, error: null });
  });

  it('uses the authoritative account permission instead of the role default', async () => {
    render(<AuthProvider><InsightScopeProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent(
      'loading=false; allowed=false; role=admin; doctor=none; version=admin:override-denied-v1',
    ));
    expect(state.rpc).toHaveBeenCalledWith('get_insight_viewer_scope');
  });

  it('exposes the resident doctor identity returned by the authoritative scope', async () => {
    state.role = 'resident_doctor';
    state.rpc.mockImplementation(async (fn: string) => fn === 'get_insight_viewer_scope'
      ? {
          data: {
            allowed: true,
            role: 'resident_doctor',
            doctor_id: 'doctor-resident-actual',
            permission_version: 'resident:allowed-v2',
          },
          error: null,
        }
      : { data: false, error: null });

    render(<AuthProvider><InsightScopeProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent(
      'loading=false; allowed=true; role=resident_doctor; doctor=doctor-resident-actual; version=resident:allowed-v2',
    ));
  });

  it('fails closed when an allowed viewer scope is malformed', async () => {
    state.rpc.mockResolvedValue({
      data: { allowed: true, role: 'resident_doctor', doctor_id: { leaked: 'doctor' }, permission_version: null },
      error: null,
    });
    render(<AuthProvider><InsightScopeProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent(
      'loading=false; allowed=false; role=admin; doctor=none; version=unavailable',
    ));
  });

  it('atomically blocks sources and removes every Insight query family when the authenticated account changes', async () => {
    state.rpc.mockImplementation(async (fn: string) => fn === 'get_insight_viewer_scope'
      ? { data: { allowed: true, role: 'admin', doctor_id: null, permission_version: 'account-a:v1' }, error: null }
      : { data: false, error: null });
    render(<AuthProvider><><InsightScopeProbe /><InsightSourceProbe /></></AuthProvider>);
    await waitFor(() => expect(state.authListener).not.toBeNull());
    await waitFor(() => expect(screen.getByLabelText('Insight source guard')).toHaveTextContent('mounted-for-account-a'));

    act(() => state.authListener?.('SIGNED_IN', session('account-b')));

    expect(screen.getByLabelText('Insight source guard')).toHaveTextContent('blocked');
    expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent(
      'loading=true; allowed=false; role=none; doctor=none; version=transitioning',
    );
    for (const queryKey of [
      ['clinic-health'], ['bank-health'], ['financial-control'], ['clinical-attendance-heatmap'],
      ['panel-billed-insights'], ['sales-insights'], ['financial-insights'],
      ['insight-performance'], ['insight-performance-detail'], ['doctor-clinical-activity'],
    ]) {
      expect(state.cancelQueries).toHaveBeenCalledWith({ queryKey });
      expect(state.removeQueries).toHaveBeenCalledWith({ queryKey });
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });
  });

  it('fails closed and removes performance reports when effective clinic permissions change', async () => {
    render(<AuthProvider><div>child</div></AuthProvider>);
    await waitFor(() => expect(state.authListener).not.toBeNull());

    act(() => window.dispatchEvent(new Event('clinic-permissions-changed')));

    await waitFor(() => expect(state.removeQueries).toHaveBeenCalledWith({
      queryKey: ['insight-performance'],
    }));
  });

  it('keeps a newer same-user denial when an older allow response arrives last', async () => {
    const olderAllow = deferred<{ data: object; error: null }>();
    const newerDeny = deferred<{ data: object; error: null }>();
    let scopeCall = 0;
    state.role = 'doctor_admin';
    state.rpc.mockImplementation((fn: string) => {
      if (fn !== 'get_insight_viewer_scope') return Promise.resolve({ data: false, error: null });
      scopeCall += 1;
      if (scopeCall === 1) return Promise.resolve({ data: { allowed: true, role: 'doctor_admin', doctor_id: null, permission_version: 'allow:v1' }, error: null });
      if (scopeCall === 2) return olderAllow.promise;
      return newerDeny.promise;
    });
    render(<AuthProvider><><InsightScopeProbe /><InsightSourceProbe /></></AuthProvider>);
    await waitFor(() => expect(screen.getByLabelText('Insight source guard')).toHaveTextContent('mounted-for-account-a'));

    act(() => window.dispatchEvent(new Event('clinic-permissions-changed')));
    expect(screen.getByLabelText('Insight source guard')).toHaveTextContent('blocked');
    act(() => window.dispatchEvent(new Event('clinic-permissions-changed')));
    await act(async () => newerDeny.resolve({ data: { allowed: false, role: 'doctor_admin', doctor_id: null, permission_version: 'deny:v3' }, error: null }));
    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('allowed=false; role=doctor_admin'));
    await act(async () => olderAllow.resolve({ data: { allowed: true, role: 'doctor_admin', doctor_id: null, permission_version: 'allow:v2' }, error: null }));

    expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('allowed=false; role=doctor_admin');
    expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('version=deny:v3');
    expect(screen.getByLabelText('Insight source guard')).toHaveTextContent('blocked');
    expect(state.removeQueries).toHaveBeenCalledWith({ queryKey: ['insight-performance'] });
  });

  it('publishes a live authoritative role downgrade and removes named-doctor presentation', async () => {
    let scopeRole = 'doctor_admin';
    state.role = 'doctor_admin';
    state.rpc.mockImplementation(async (fn: string) => fn === 'get_insight_viewer_scope'
      ? { data: { allowed: true, role: scopeRole, doctor_id: null, permission_version: `${scopeRole}:v1` }, error: null }
      : { data: false, error: null });
    render(<AuthProvider><InsightScopeProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('role=doctor_admin'));

    scopeRole = 'operations';
    state.role = 'operations';
    act(() => window.dispatchEvent(new Event('clinic-permissions-changed')));

    await waitFor(() => expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('role=operations'));
    expect(screen.getByLabelText('Insight viewer scope')).toHaveTextContent('allowed=true');
  });
});
