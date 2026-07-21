export const GOOGLE_CONVERSION_EVENT_NAMES = Object.freeze([
  "contact_click",
  "phone_click",
  "whatsapp_click",
] as const);

export type GoogleConversionEvent = (typeof GOOGLE_CONVERSION_EVENT_NAMES)[number];

const googleConversionEventNames = new Set<unknown>(GOOGLE_CONVERSION_EVENT_NAMES);

export function isGoogleConversionEvent(event: unknown): event is GoogleConversionEvent {
  return googleConversionEventNames.has(event);
}
