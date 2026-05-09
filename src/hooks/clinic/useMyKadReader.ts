import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface MyKadPayload {
  name?: string;
  ic_number?: string;
  dob?: string;
  gender?: string;
  address?: string;
}

const BRIDGE_URL =
  (import.meta.env.VITE_MYKAD_BRIDGE_URL as string | undefined) ||
  'http://127.0.0.1:8080/api/read-mykad';

const ERROR_MSG =
  'Could not connect to IC Reader. Ensure the bridge software is running.';

export function useMyKadReader() {
  const [isReading, setIsReading] = useState(false);

  const readMyKad = useCallback(async (): Promise<MyKadPayload | null> => {
    setIsReading(true);
    try {
      const res = await fetch(BRIDGE_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        toast.error(ERROR_MSG);
        return null;
      }
      const data = (await res.json()) as MyKadPayload;
      return data;
    } catch {
      toast.error(ERROR_MSG);
      return null;
    } finally {
      setIsReading(false);
    }
  }, []);

  return { readMyKad, isReading };
}
