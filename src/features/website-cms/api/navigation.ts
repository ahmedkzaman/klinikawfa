import type { SupabaseClient } from "@supabase/supabase-js";
import { navigationDraftSchema, type NavigationDraftItem } from "@/features/website-cms/navigation/schema";
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as SupabaseClient;
export async function fetchNavigationEditor(): Promise<{items:NavigationDraftItem[];revision:number}> {
  const {data:draft,error:draftError}=await client.from("website_navigation_drafts").select("draft_items,base_revision").eq("singleton",true).maybeSingle();
  if(draftError)throw new Error("Navigation draft could not be loaded");
  if(draft)return {items:navigationDraftSchema.parse(draft.draft_items),revision:draft.base_revision};
  const {data,error}=await client.from("website_navigation_items").select("id,parent_id,href,label_ms,label_en,is_visible,display_order,revision").order("display_order");
  if(error||!data)throw new Error("Navigation could not be loaded");
  return {items:navigationDraftSchema.parse(data.map((row)=>({id:row.id,parentId:row.parent_id,href:row.href,labelMs:row.label_ms,labelEn:row.label_en??"",visible:row.is_visible,displayOrder:row.display_order}))),revision:Math.max(0,...data.map((row)=>row.revision))};
}
export async function saveNavigationDraft(items:NavigationDraftItem[],revision:number):Promise<void>{const payload=navigationDraftSchema.parse(items);const{error}=await client.from("website_navigation_drafts").upsert({singleton:true,draft_items:payload,base_revision:revision},{onConflict:"singleton"});if(error)throw new Error("Navigation draft could not be saved")}
export async function publishNavigationDraft(revision:number):Promise<number>{const{data,error}=await client.rpc("publish_website_navigation",{p_expected_revision:revision});if(error?.code==="40001")throw new Error("Navigation changed after you opened it. Reload before publishing.");if(error)throw new Error("Navigation could not be published");return Number((data as {revision?:number})?.revision??revision+1)}
export async function fetchNavigationVersions():Promise<Array<{id:string;revision:number;publishedAt:string}>>{const{data,error}=await client.from("website_content_versions").select("id,revision,published_at").eq("resource_type","navigation").eq("resource_id","00000000-0000-0000-0000-000000000001").order("revision",{ascending:false}).limit(20);if(error||!data)throw new Error("Navigation history could not be loaded");return data.map((row)=>({id:row.id,revision:row.revision,publishedAt:row.published_at}))}
export async function restoreNavigationVersion(versionId:string):Promise<void>{const{error}=await client.rpc("restore_website_navigation_version",{p_version_id:versionId});if(error)throw new Error("Navigation version could not be restored")}
