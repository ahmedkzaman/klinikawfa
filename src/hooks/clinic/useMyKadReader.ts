import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface MyKadPayload {
  name?: string;
  ic_no?: string;
  dob?: string;
  gender?: string;
  address?: string;
}

interface BridgeResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

const BRIDGE_URL =
  (import.meta.env.VITE_MYKAD_BRIDGE_URL as string | undefined) ||
  'http://localhost:8787/read-mykad';
const LOOPBACK_BRIDGE_URL = 'http://127.0.0.1:8787/read-mykad';

const BRIDGE_DOWN_MSG =
  'MyKad Bridge is not running. Please open the MyKad Bridge app on this computer.';

function asString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}

function asDigits(raw: unknown): string | undefined {
  const v = asString(raw);
  if (!v) return undefined;
  const digits = v.replace(/\D/g, '');
  return digits.length ? digits : undefined;
}

function getBridgeUrls(): string[] {
  return Array.from(new Set([BRIDGE_URL, LOOPBACK_BRIDGE_URL]));
}

function toMyKadPayload(raw: Record<string, unknown>): MyKadPayload {
  const lower = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]),
  ) as Record<string, unknown>;

  const name =
    asString(lower.name) ??
    asString(lower.fullname) ??
    asString(lower.full_name) ??
    asString(lower.nama) ??
    asString(lower.nama_penuh);

  const ic_no =
    asDigits(lower.ic_no) ??
    asDigits(lower.icno) ??
    asDigits(lower.ic) ??
    asDigits(lower.nric) ??
    asDigits(lower.national_id) ??
    asDigits(lower.mykad) ??
    asDigits(lower.my_kad) ??
    asDigits(lower.r) ??
    asDigits(lower.id_no);

  const dob =
    asString(lower.dob) ??
    asString(lower.date_of_birth) ??
    asString(lower.birthdate) ??
    asString(lower.dob_full);

  const gender =
    asString(lower.gender) ??
    asString(lower.sex) ??
    asString(lower.jantina);

  const address =
    asString(lower.address) ??
    asString(lower.alamat) ??
    asString(lower.alamat_penuh);

  return { name, ic_no, dob, gender, address };
}

export function useMyKadReader() {
  const [isReading, setIsReading] = useState(false);

  const readMyKad = useCallback(async (): Promise<MyKadPayload | null> => {
    setIsReading(true);
    try {
      let res: Response | null = null;
      let lastFetchFailed = false;
      for (const url of getBridgeUrls()) {
        try {
          res = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(40_000),
          });
          break;
        } catch {
          // Network failure / CORS / timeout / mixed-content block
          lastFetchFailed = true;
        }
      }

      if (!res) {
        toast.error(BRIDGE_DOWN_MSG);
        return null;
      }

      if (!res.ok) {
        toast.error(
          lastFetchFailed
            ? 'MyKad Bridge was reached on fallback address but returned an unexpected error.'
            : 'MyKad Bridge returned an unexpected error.',
        );
        return null;
      }

      const result = (await res.json()) as BridgeResponse;
      if (!result.success) {
        toast.error(result.message || 'IC Reader returned an error.');
        return null;
      }

      const payload = typeof result.data === 'object' && result.data !== null ? result.data : result;
      const normalized = toMyKadPayload(payload);
      if (!normalized.ic_no && !normalized.name && !normalized.dob && !normalized.gender && !normalized.address) {
        toast.error('Reader returned an unknown response format.');
        return null;
      }
      return normalized;
    } finally {
      setIsReading(false);
    }
  }, []);

  return { readMyKad, isReading };
}
