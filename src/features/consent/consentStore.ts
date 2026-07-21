import type {
  MarketingConsent,
  MarketingConsentChoice,
  MarketingConsentSelection,
} from "@/features/consent/types";

export const CONSENT_STORAGE_KEY = "klinikawfa.consent";

const UNKNOWN_CONSENT: MarketingConsent = { status: "unknown" };
const RECORD_KEYS = ["marketing", "updatedAt", "version"];
let withdrawnForSession = false;

type StoredMarketingConsent = {
  marketing: MarketingConsentChoice;
  updatedAt: string;
  version: number;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isStoredMarketingConsent(
  value: unknown,
): value is StoredMarketingConsent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === RECORD_KEYS.length &&
    keys.every((key, index) => key === RECORD_KEYS[index]) &&
    isPositiveInteger(record.version) &&
    (record.marketing === "accepted" || record.marketing === "rejected") &&
    isIsoTimestamp(record.updatedAt)
  );
}

export function readMarketingConsent(requiredVersion: number): MarketingConsent {
  if (
    withdrawnForSession ||
    !isPositiveInteger(requiredVersion) ||
    typeof window === "undefined"
  ) {
    return UNKNOWN_CONSENT;
  }

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return UNKNOWN_CONSENT;

    const stored: unknown = JSON.parse(raw);
    if (!isStoredMarketingConsent(stored) || stored.version !== requiredVersion) {
      return UNKNOWN_CONSENT;
    }

    return { ...stored, status: "known" };
  } catch {
    return UNKNOWN_CONSENT;
  }
}

export function writeMarketingConsent(
  choice: MarketingConsentSelection,
): MarketingConsent {
  if (
    !isPositiveInteger(choice.version) ||
    (choice.marketing !== "accepted" && choice.marketing !== "rejected") ||
    typeof window === "undefined"
  ) {
    return UNKNOWN_CONSENT;
  }

  const stored: StoredMarketingConsent = {
    marketing: choice.marketing,
    updatedAt: new Date().toISOString(),
    version: choice.version,
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
    withdrawnForSession = false;
    return { ...stored, status: "known" };
  } catch {
    return UNKNOWN_CONSENT;
  }
}

export function withdrawMarketingConsent(): MarketingConsent {
  if (typeof window === "undefined") return UNKNOWN_CONSENT;

  withdrawnForSession = true;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // An in-memory consumer still receives unknown and must keep marketing off.
  }

  return UNKNOWN_CONSENT;
}
