import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPublicSeoFallback, buildPublicSeoSchemas } from '../../scripts/public-seo-fallbacks.mjs';
import { LOCAL_SERVICE_REVIEW } from '@/content/localServicePages';
import { CLINIC_INFO } from '@/lib/constants';

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
      expect(html).toContain(
        `<address>${CLINIC_INFO.address.full.replaceAll('&', '&amp;')}</address>`,
      );
      expect(html).toContain(`${CLINIC_INFO.hours.days}, ${CLINIC_INFO.hours.timeMalay}`);
      expect(html).toContain(`href="${CLINIC_INFO.phoneLink}"`);
      expect(html).toContain(`href="${CLINIC_INFO.whatsapp}"`);
      expect(html).toContain(`href="${CLINIC_INFO.googleMapsUrl.replaceAll('&', '&amp;')}"`);
      expect(html).toContain('href="/doctors"');
      expect(html).toContain('href="/services/minor-surgery-kutil-kuantan"');
      expect(html).toContain(`Disemak oleh ${LOCAL_SERVICE_REVIEW.organization}`);
      expect(html).toContain(
        `<time datetime="${LOCAL_SERVICE_REVIEW.date}">${LOCAL_SERVICE_REVIEW.date}</time>`,
      );
      expect(html).not.toContain('clinic_queue');
      expect(html).toContain('<script data-rh="true" type="application/ld+json">');
      const schemaJson = html.match(/<script data-rh="true" type="application\/ld\+json">(.*?)<\/script>/)?.[1];
      const schemas = JSON.parse(schemaJson || '[]');
      expect(schemas).toEqual(expect.arrayContaining([
        expect.objectContaining({ '@type': 'MedicalClinic', '@id': 'https://klinikawfa.com/#clinic' }),
        expect.objectContaining({
          '@type': 'Service',
          name: 'Klinik Sunat Kuantan untuk Bayi, Kanak-kanak & Dewasa | Klinik Awfa',
          description: 'Penilaian dan perkhidmatan sunat bayi, kanak-kanak dan dewasa di Klinik Awfa, KotaSAS, Kuantan, termasuk persediaan dan penjagaan selepas prosedur.',
          url: 'https://klinikawfa.com/services/sunat-kuantan/',
          provider: { '@id': 'https://klinikawfa.com/#clinic' },
        }),
        expect.objectContaining({ '@type': 'FAQPage' }),
      ]));
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

  it('builds a public-facts-only graph whose FAQs match the visible Sunat fallback', () => {
    const schemas = buildPublicSeoSchemas('services/sunat-kuantan');
    const fallback = buildPublicSeoFallback('services/sunat-kuantan');

    expect(schemas).toEqual(expect.arrayContaining([
      expect.objectContaining({ '@type': 'WebPage', url: 'https://klinikawfa.com/services/sunat-kuantan/' }),
      expect.objectContaining({ '@type': 'BreadcrumbList' }),
    ]));
    const faq = schemas?.find((schema) => schema['@type'] === 'FAQPage');
    expect(faq).toMatchObject({
      mainEntity: expect.arrayContaining([
        expect.objectContaining({
          name: 'Adakah konsultasi diperlukan sebelum tarikh sunat?',
          acceptedAnswer: expect.objectContaining({
            text: 'Ya, penilaian membantu doktor menyemak kesihatan, anatomi, ubat dan faktor pendarahan serta menerangkan persediaan. Dalam sesetengah keadaan, prosedur perlu ditangguhkan atau dirujuk.',
          }),
        }),
      ]),
    });
    expect(fallback).toContain(String((faq as { mainEntity: Array<{ name: string }> }).mainEntity[0].name));
    expect(fallback).toContain(String((faq as { mainEntity: Array<{ acceptedAnswer: { text: string } }> }).mainEntity[0].acceptedAnswer.text));
  });

  it.each(['__proto__', 'constructor', 'toString'])('returns undefined for unsupported inherited route %s', (route) => {
    expect(buildPublicSeoFallback(route)).toBeUndefined();
  });
});
