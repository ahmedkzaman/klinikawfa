export const WEBSITE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const WEBSITE_MEDIA_TYPES = ["image/jpeg","image/png","image/webp","video/mp4","video/webm"] as const;
export const WEBSITE_MEDIA_FOLDERS = ["home","pages","services","team","blog","gallery","reviews"] as const;
export type WebsiteMediaFolder = (typeof WEBSITE_MEDIA_FOLDERS)[number];

const extensions:Record<(typeof WEBSITE_MEDIA_TYPES)[number],string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm"};
export function validateWebsiteMedia(file:Pick<File,"size"|"type">):{extension:string;mime:(typeof WEBSITE_MEDIA_TYPES)[number]}{if(!WEBSITE_MEDIA_TYPES.includes(file.type as never))throw new Error("Use JPEG, PNG, WebP, MP4 or WebM files only.");if(file.size<=0||file.size>WEBSITE_MEDIA_MAX_BYTES)throw new Error("Website media must be 25 MiB or smaller.");const mime=file.type as (typeof WEBSITE_MEDIA_TYPES)[number];return{mime,extension:extensions[mime]}}
export function createWebsiteMediaPath(folder:WebsiteMediaFolder,extension:string,id=crypto.randomUUID()){return`${folder}/${id}.${extension}`}
