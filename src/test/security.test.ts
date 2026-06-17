import { describe, expect, it, vi } from 'vitest';

import { escapeHtml, generateTemporaryPassword, isSafeUrl, sanitizeCssValue } from '@/lib/security';

describe('security helpers', () => {
  it('escapes HTML metacharacters for safe innerHTML composition', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;');
  });

  it('rejects javascript/data URLs while allowing common safe schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<svg onload=alert(1)>')).toBe(false);
    expect(isSafeUrl('https://klinikawfa.example/path')).toBe(true);
    expect(isSafeUrl('/services')).toBe(true);
    expect(isSafeUrl('mailto:hello@example.com')).toBe(true);
  });

  it('rejects CSS values that can break out of style declarations', () => {
    expect(sanitizeCssValue('#123abc')).toBe('#123abc');
    expect(sanitizeCssValue('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(sanitizeCssValue('red; background:url(javascript:alert(1))')).toBeNull();
  });

  it('generates non-default temporary passwords with browser crypto', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const bytes = array as Uint8Array;
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = i + 10;
      return array;
    });

    const password = generateTemporaryPassword(16);

    expect(password).toHaveLength(16);
    expect(password).not.toBe('test1234');
  });
});
