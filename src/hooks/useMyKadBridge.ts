import { useEffect, useRef, useState } from 'react';

export type MyKadBridgeStatus =
  | 'connected_card_ready'
  | 'connected_no_card'
  | 'disconnected';

const RAW_URL =
  (import.meta.env.VITE_MYKAD_BRIDGE_URL as string | undefined) ||
  'http://localhost:8787/read-mykad';

/** Derive the status endpoint from the bridge base URL. */
function getStatusUrl(): string {
  try {
    const u = new URL(RAW_URL);
    u.pathname = u.pathname.replace(/\/read-mykad\/?$/, '') + '/health';
    return u.toString();
  } catch {
    return 'http://localhost:8787/health';
  }
}

const STATUS_URL = getStatusUrl();

/**
 * Silently polls the local MyKad bridge every `intervalMs` ms.
 * Never logs; any failure (timeout, network, CORS, non-2xx) maps to 'disconnected'.
 * Pauses polling while the tab is hidden.
 */
export function useMyKadBridge(intervalMs = 10_000): { status: MyKadBridgeStatus } {
  const [status, setStatus] = useState<MyKadBridgeStatus>('disconnected');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch(STATUS_URL, {
          method: 'GET',
          // 2s ping timeout — fast enough to not pile up.
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) {
          if (!cancelled) setStatus('disconnected');
          return;
        }
        const body = (await res.json().catch(() => null)) as
          | { card_present?: boolean; cardPresent?: boolean }
          | null;
        const present = body?.card_present ?? body?.cardPresent ?? false;
        if (!cancelled) {
          setStatus(present ? 'connected_card_ready' : 'connected_no_card');
        }
      } catch {
        // Silent: no console spam.
        if (!cancelled) setStatus('disconnected');
      }
    };

    const start = () => {
      if (timerRef.current) return;
      void ping();
      timerRef.current = setInterval(() => {
        void ping();
      }, intervalMs);
    };
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return { status };
}
