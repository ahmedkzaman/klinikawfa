const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

export function isSafeUrl(rawUrl: string): boolean {
  const value = rawUrl.trim();
  if (!value) return false;

  if (value.startsWith('/') || value.startsWith('#')) return true;

  try {
    const parsed = new URL(value);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizeCssValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^(?:rgb|hsl)a?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z]+$/.test(trimmed) && trimmed.length <= 32) return trimmed;

  return null;
}

const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export function generateTemporaryPassword(length = 16): string {
  const normalizedLength = Math.max(12, Math.min(72, Math.floor(length)));
  const bytes = new Uint8Array(normalizedLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARS.length]).join('');
}
