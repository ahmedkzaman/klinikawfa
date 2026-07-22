export const WEBSITE_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export type WebsiteMediaMimeType = (typeof WEBSITE_MEDIA_MIME_TYPES)[number];

export interface WebsiteMedia {
  id: string;
  storageBucket: "website-media";
  storagePath: string;
  mimeType: WebsiteMediaMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  altMs: string;
  altEn: string;
  captionMs: string;
  captionEn: string;
  descriptionMs: string;
  descriptionEn: string;
  replacedBy: string | null;
  trashedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
