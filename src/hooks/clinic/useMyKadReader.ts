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
  data?: MyKadPayload;
}

const BRIDGE_URL =
  (import.meta.env.VITE_MYKAD_BRIDGE_URL as string | undefined) ||
  'http://localhost:8787/read-mykad';

const BRIDGE_DOWN_MSG =
  'MyKad Bridge is not running. Please open the MyKad Bridge app on this computer.';

export function useMyKadReader() {
  const [isReading, setIsReading] = useState(false);

  const readMyKad = useCallback(async (): Promise<MyKadPayload | null> => {
    setIsReading(true);
    try {
      let res: Response;
      try {
        res = await fetch(BRIDGE_URL, {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // Network failure / CORS / timeout / mixed-content block
        toast.error(BRIDGE_DOWN_MSG);
        return null;
      }

      if (!res.ok) {
        toast.error('MyKad Bridge returned an unexpected error.');
        return null;
      }

      const result = (await res.json()) as BridgeResponse;
      if (!result.success) {
        toast.error(result.message || 'IC Reader returned an error.');
        return null;
      }
      return result.data ?? null;
    } finally {
      setIsReading(false);
    }
  }, []);

  return { readMyKad, isReading };
}
