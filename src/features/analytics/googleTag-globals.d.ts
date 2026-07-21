export {};

declare global {
  type GoogleDataLayerEntry = readonly unknown[];

  interface Window {
    dataLayer?: GoogleDataLayerEntry[];
  }
}
