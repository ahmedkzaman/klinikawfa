import { HttpError } from "../_shared/auth-helpers.ts";

const SERVICE_PATHS = new Set([
  "/services/rawatan-umum/",
  "/services/prosedur-kecil/",
  "/services/pemeriksaan-kesihatan/",
  "/services/rawatan-telinga-kuantan/",
  "/services/minor-surgery-kutil-kuantan/",
  "/services/swab-test-demam-kuantan/",
  "/services/pengurusan-berat-badan-kuantan/",
  "/services/sunat-kuantan/",
]);

const REQUEST_KEYS = new Set([
  "path",
  "titleMs",
  "titleEn",
  "focusPhraseMs",
  "focusPhraseEn",
  "contentMs",
  "contentEn",
]);
const LANGUAGE_KEYS = new Set(["title", "description", "socialTitle", "socialDescription"]);

export type ServiceSeoRequest = {
  path: string;
  titleMs: string;
  titleEn: string;
  focusPhraseMs: string;
  focusPhraseEn: string;
  contentMs?: string;
  contentEn?: string;
};

export type GeneratedServiceSeo = {
  ms: { title: string; description: string; socialTitle: string; socialDescription: string };
  en: { title: string; description: string; socialTitle: string; socialDescription: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  status: 400 | 502,
): string {
  if (typeof value !== "string") throw new HttpError(status, status === 400 ? "Invalid request" : "SEO provider returned invalid content");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(status, status === 400 ? `${field} is invalid` : "SEO provider returned invalid content");
  }
  return normalized;
}

export function validateServiceSeoRequest(value: unknown): ServiceSeoRequest {
  if (!isRecord(value) || Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) {
    throw new HttpError(400, "Invalid request");
  }
  const path = boundedString(value.path, "path", 120, 400);
  if (!SERVICE_PATHS.has(path)) throw new HttpError(400, "Unknown service page");

  const request: ServiceSeoRequest = {
    path,
    titleMs: boundedString(value.titleMs, "Malay title", 200, 400),
    titleEn: boundedString(value.titleEn, "English title", 200, 400),
    focusPhraseMs: boundedString(value.focusPhraseMs, "Malay target phrase", 160, 400),
    focusPhraseEn: boundedString(value.focusPhraseEn, "English target phrase", 160, 400),
  };
  if (value.contentMs !== undefined) request.contentMs = boundedString(value.contentMs, "Malay content", 20_000, 400);
  if (value.contentEn !== undefined) request.contentEn = boundedString(value.contentEn, "English content", 20_000, 400);
  return request;
}

function parseLanguage(value: unknown): GeneratedServiceSeo["ms"] {
  if (!isRecord(value) || Object.keys(value).length !== LANGUAGE_KEYS.size || Object.keys(value).some((key) => !LANGUAGE_KEYS.has(key))) {
    throw new HttpError(502, "SEO provider returned invalid content");
  }
  return {
    title: boundedString(value.title, "title", 120, 502),
    description: boundedString(value.description, "description", 320, 502),
    socialTitle: boundedString(value.socialTitle, "social title", 120, 502),
    socialDescription: boundedString(value.socialDescription, "social description", 320, 502),
  };
}

export function parseGeneratedServiceSeo(content: string): GeneratedServiceSeo {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new HttpError(502, "SEO provider returned invalid content");
  }
  if (!isRecord(value) || Object.keys(value).length !== 2 || !("ms" in value) || !("en" in value)) {
    throw new HttpError(502, "SEO provider returned invalid content");
  }
  return { ms: parseLanguage(value.ms), en: parseLanguage(value.en) };
}
