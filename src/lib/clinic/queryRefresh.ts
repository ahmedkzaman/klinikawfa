export type QueryRefreshResultLike = {
  isError?: boolean;
  error?: unknown;
  status?: string;
};

function flattenRefreshResults(result: unknown): QueryRefreshResultLike[] {
  if (Array.isArray(result)) {
    return result.flatMap(flattenRefreshResults);
  }
  if (result && typeof result === 'object') {
    return [result as QueryRefreshResultLike];
  }
  return [];
}

export function assertRefreshSucceeded(result: unknown, label = 'data refresh') {
  for (const item of flattenRefreshResults(result)) {
    if (item.isError || item.status === 'error' || item.error) {
      const detail = item.error instanceof Error
        ? item.error.message
        : typeof item.error === 'string'
          ? item.error
          : `${label} failed`;
      throw new Error(detail);
    }
  }
}
