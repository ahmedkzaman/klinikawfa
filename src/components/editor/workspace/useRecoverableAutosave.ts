import { useCallback, useEffect, useMemo, useState } from "react";

interface RecoveryRecord<T> {
  savedAt: string;
  serverUpdatedAt: string | null;
  value: T;
  version: 1;
}

interface RecoverableAutosaveOptions<T> {
  key: string;
  value: T;
  serverUpdatedAt: string | null;
  delayMs?: number;
  enabled?: boolean;
}

function readRecovery<T>(storageKey: string, serverUpdatedAt: string | null) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryRecord<T>;
    if (parsed.version !== 1 || parsed.serverUpdatedAt !== serverUpdatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useRecoverableAutosave<T>({
  key,
  value,
  serverUpdatedAt,
  delayMs = 800,
  enabled = true,
}: RecoverableAutosaveOptions<T>) {
  const storageKey = useMemo(() => `website-editor:v1:${key}`, [key]);
  const [recovery, setRecovery] = useState<RecoveryRecord<T> | null>(() => readRecovery(storageKey, serverUpdatedAt));

  useEffect(() => {
    setRecovery(readRecovery(storageKey, serverUpdatedAt));
  }, [serverUpdatedAt, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      const record: RecoveryRecord<T> = {
        savedAt: new Date().toISOString(),
        serverUpdatedAt,
        value,
        version: 1,
      };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(record));
      } catch {
        // A full or unavailable browser store must never block editing.
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, enabled, serverUpdatedAt, storageKey, value]);

  const clearRecovery = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } finally {
      setRecovery(null);
    }
  }, [storageKey]);

  return {
    clearRecovery,
    hasRecovery: recovery !== null,
    recoveredAt: recovery?.savedAt ?? null,
    recoveryValue: recovery?.value ?? null,
  };
}
