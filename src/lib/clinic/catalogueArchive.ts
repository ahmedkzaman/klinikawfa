export type CatalogueType = 'inventory_item' | 'service' | 'package';

export const canArchiveCatalogue = (role: string | null | undefined) =>
  role === 'admin' || role === 'special_admin';

export const isActiveCatalogueEntry = (entry: { status?: string | null; archived_at?: string | null }) =>
  (entry.status ?? 'active') === 'active' && !entry.archived_at;
