const publishedRegistryFields = [
  'path',
  'seo_ms',
  'seo_ms_social_image_path',
  'published_at',
  'updated_at',
].join(',');

const validTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function buildPublishedLastModifiedOverlay(rows) {
  const latestByPath = new Map();
  if (!Array.isArray(rows)) return latestByPath;

  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.path !== 'string') continue;
    const publishedAt = validTimestamp(row.published_at);
    if (publishedAt === null) continue;
    const updatedAt = validTimestamp(row.updated_at);
    const latest = Math.max(publishedAt, updatedAt ?? publishedAt);
    const current = latestByPath.get(row.path);
    if (!current || latest > current.timestamp) {
      latestByPath.set(row.path, {
        timestamp: latest,
        lastModified: new Date(latest).toISOString().slice(0, 10),
      });
    }
  }

  return new Map(
    [...latestByPath].map(([path, value]) => [path, value.lastModified]),
  );
}

export async function loadPublishedServiceSeoRows({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    let rows;
    if (env.SERVICE_SEO_REGISTRY_JSON) {
      rows = JSON.parse(env.SERVICE_SEO_REGISTRY_JSON);
    } else {
      const base = env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!base || !key) return [];
      const response = await fetchImpl(
        `${base}/rest/v1/website_service_seo?select=${publishedRegistryFields}&published_at=not.is.null`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rows = await response.json();
    }
    if (!Array.isArray(rows)) throw new Error('registry is not an array');
    return rows;
  } catch (error) {
    console.warn(
      `[service-seo] using checked-in crawler fallbacks: ${error instanceof Error ? error.message : 'registry unavailable'}`,
    );
    return [];
  }
}
