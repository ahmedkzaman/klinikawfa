export function resolveRecoverySessionState({
  session,
  hash,
}: {
  session: unknown;
  hash: string;
}): boolean | null {
  const hasRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token');

  if (session || hasRecoveryHash) return true;
  return false;
}
