import { uploadAndCreateMedia } from "@/features/website-cms/media/api";
import type { WebsiteMediaFolder } from "@/features/website-cms/media/validation";

export async function uploadWebsiteMedia(file: File, folder: WebsiteMediaFolder): Promise<string> {
  return (await uploadAndCreateMedia(file, folder)).publicUrl;
}
