import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPublicSeoFallback } from '../../scripts/public-seo-fallbacks.mjs';

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

  it('matches the approved Sunat sections and FAQs', () => {
    const fallback = buildPublicSeoFallback('services/sunat-kuantan');

    expect(fallback).toContain(
      'Penjaga akan diterangkan tentang persediaan, kaedah yang dipertimbangkan dan cara menjaga kawasan selepas prosedur. Jangan sapukan krim, herba atau ubat tanpa arahan klinikal.',
    );
    expect(fallback).toContain(
      'Doktor akan menilai sama ada prosedur boleh dilakukan di klinik dan berbincang tentang kawalan sakit serta penjagaan luka. Kerjasama dan keselamatan kanak-kanak menjadi sebahagian daripada pertimbangan kesesuaian.',
    );
    expect(fallback).toContain(
      'Privasi dan persetujuan pesakit dihormati. Kaedah, risiko yang relevan, penjagaan luka dan jangkaan aktiviti akan diterangkan berdasarkan penilaian individu.',
    );
    expect(fallback).toContain(
      'Kesesuaian prosedur dan masa pelaksanaannya bergantung pada penilaian doktor. Pemeriksaan awal mungkin membawa kepada penangguhan atau rujukan jika itu lebih selamat.',
    );
    expect(fallback).toContain(
      'Hadiri susulan jika dijadualkan. Hubungi klinik jika anda tidak pasti tentang rupa luka atau cara penjagaan, dan elakkan menggunakan bahan tradisional pada luka tanpa nasihat.',
    );
    expect(fallback).toContain('<h2>Soalan lazim</h2>');
    expect(fallback).toContain('Adakah konsultasi diperlukan sebelum tarikh sunat?');
    expect(fallback).toContain('Kaedah sunat mana yang akan digunakan?');
    expect(fallback).toContain('Berapa lama perlu berehat selepas sunat?');
    expect(fallback).toContain('Bolehkah sunat dilakukan jika sedang demam atau batuk?');
    expect(fallback).toContain(
      'Ya, penilaian membantu doktor menyemak kesihatan, anatomi, ubat dan faktor pendarahan serta menerangkan persediaan. Dalam sesetengah keadaan, prosedur perlu ditangguhkan atau dirujuk.',
    );
    expect(fallback).toContain(
      'Pilihan kaedah bergantung pada umur, anatomi, keadaan klinikal, ketersediaan dan pertimbangan doktor. Pilihan yang sesuai akan dibincangkan semasa konsultasi.',
    );
    expect(fallback).toContain(
      'Tempoh kembali ke sekolah, kerja, sukan atau aktiviti seksual berbeza mengikut umur, kaedah, jenis aktiviti dan pemulihan luka. Ikuti arahan khusus yang diberikan selepas prosedur.',
    );
    expect(fallback).toContain(
      'Maklumkan simptom kepada klinik sebelum hadir. Doktor akan menilai sama ada prosedur wajar diteruskan atau ditangguhkan demi keselamatan.',
    );
  });

  it.each(['__proto__', 'constructor', 'toString'])('returns undefined for unsupported inherited route %s', (route) => {
    expect(buildPublicSeoFallback(route)).toBeUndefined();
  });
});
