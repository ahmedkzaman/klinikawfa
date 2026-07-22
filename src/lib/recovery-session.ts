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

export function getRecoveryTokens(hash: string): {
  accessToken: string;
  refreshToken: string;
} | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}
