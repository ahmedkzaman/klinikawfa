import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../..');
const seoPrepareScriptPath = resolve(repoRoot, 'scripts/prepare-public-seo-pages.mjs');

describe('public SEO crawler fallback', () => {
  it('ships meaningful Sunat content before JavaScript executes', () => {
    const distFixture = mkdtempSync(resolve(tmpdir(), 'klinikawfa-public-seo-'));

    try {
      for (const route of [
        'services',
        'services/rawatan-umum',
        'services/prosedur-kecil',
        'services/pemeriksaan-kesihatan',
        'services/rawatan-telinga-kuantan',
        'services/minor-surgery-kutil-kuantan',
        'services/swab-test-demam-kuantan',
        'services/pengurusan-berat-badan-kuantan',
        'services/sunat-kuantan',
      ]) {
        const routeDir = resolve(distFixture, route);
        mkdirSync(routeDir, { recursive: true });
        writeFileSync(
          resolve(routeDir, 'index.html'),
          '<!doctype html><html lang="ms"><head><title>Klinik Awfa</title></head><body><div id="root"></div></body></html>',
        );
      }

      execFileSync(process.execPath, [seoPrepareScriptPath, distFixture], {
        cwd: repoRoot,
        stdio: 'pipe',
      });

      const html = readFileSync(resolve(distFixture, 'services/sunat-kuantan/index.html'), 'utf8');
      expect(html).toContain('<h1>Sunat di Kuantan untuk bayi, kanak-kanak dan dewasa</h1>');
      expect(html).toContain('<h2>Sunat bayi</h2>');
      expect(html).toContain('<h2>Sunat kanak-kanak</h2>');
      expect(html).toContain('<h2>Sunat dewasa</h2>');
      expect(html).toContain('href="/appointment"');
      expect(html).not.toContain('clinic_queue');
    } finally {
      rmSync(distFixture, { recursive: true, force: true });
    }
  });
});
