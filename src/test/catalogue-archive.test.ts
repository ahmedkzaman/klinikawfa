import { describe, expect, it } from 'vitest';
import { canArchiveCatalogue, isActiveCatalogueEntry } from '@/lib/clinic/catalogueArchive';

describe('catalogue archive safety', () => {
  it.each(['admin', 'special_admin'])('allows %s to archive', (role) => {
    expect(canArchiveCatalogue(role)).toBe(true);
  });

  it.each(['doctor_admin', 'operations', 'staff', null, undefined])('denies %s', (role) => {
    expect(canArchiveCatalogue(role)).toBe(false);
  });

  it('excludes archived entries from future selection', () => {
    expect(isActiveCatalogueEntry({ status: 'active', archived_at: null })).toBe(true);
    expect(isActiveCatalogueEntry({ status: 'inactive', archived_at: null })).toBe(false);
    expect(isActiveCatalogueEntry({ status: 'active', archived_at: '2026-08-30T00:00:00Z' })).toBe(false);
  });
});
