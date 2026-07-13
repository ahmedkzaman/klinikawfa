// Maps individual service slugs from src/lib/constants.ts (SERVICES) to the
// three canonical clinic_services category slugs stored in the database.
// Used by ServiceDetail to resolve any listing link to a real DB row.
export const SERVICE_CATEGORY_SLUG_MAP: Record<string, string> = {
  // Rawatan Am & Penyakit Akut
  'rawatan-umum': 'rawatan-am',
  'sakit-tekak-selsema-demam': 'rawatan-am',
  'ujian-pantas': 'rawatan-am',
  'nebulizer': 'rawatan-am',
  'sedutan-kahak': 'rawatan-am',
  'pencucian-hidung': 'rawatan-am',
  'ujian-darah-penuh': 'rawatan-am',
  'ujian-denggi': 'rawatan-am',

  // Prosedur Kecil / Minor & Pembedahan (public alias `prosedur-kecil` → DB `prosedur-minor`)
  'prosedur-kecil': 'prosedur-minor',
  'penjagaan-telinga': 'prosedur-minor',
  'khatan': 'prosedur-minor',
  'ketumbuhan-ketuat': 'prosedur-minor',

  // Pemeriksaan Kesihatan (canonical DB slug is already public-facing)
  'pemeriksaan-kesihatan': 'pemeriksaan-kesihatan',
  'pemeriksaan-darah': 'pemeriksaan-kesihatan',
  'pemeriksaan-pelajar': 'pemeriksaan-kesihatan',
  'pemeriksaan-pra-pekerjaan': 'pemeriksaan-kesihatan',
  'pemeriksaan-kembali-bekerja': 'pemeriksaan-kesihatan',
  'pemeriksaan-haji-2026': 'pemeriksaan-kesihatan',
};

export function resolveServiceCategorySlug(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return SERVICE_CATEGORY_SLUG_MAP[slug] ?? slug;
}
