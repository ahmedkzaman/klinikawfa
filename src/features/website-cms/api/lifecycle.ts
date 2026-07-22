import type { ContentStatus } from "@/features/website-cms/domain/content";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

export type LifecycleResourceType = WebsiteResourceType | "page";

export async function restore(resourceType: LifecycleResourceType, resourceId: string) {
  const state = await loadState(resourceType, resourceId);
  await call("restore_website_content", resourceType, resourceId, state.revision);
  return { status: "draft" as ContentStatus };
}

export async function trash(resourceType: LifecycleResourceType, resourceId: string) {
  const state = await loadState(resourceType, resourceId);
  await call("trash_website_content", resourceType, resourceId, state.revision);
  return { status: "trash" as ContentStatus };
}

export async function schedule(resourceType: LifecycleResourceType, resourceId: string, isoTimestamp: string) {
  const state = await loadState(resourceType, resourceId);
  await call("schedule_website_content", resourceType, resourceId, state.revision, isoTimestamp);
  return { status: "scheduled" as ContentStatus, scheduledAt: isoTimestamp };
}

export async function permanentlyDelete(resourceType: LifecycleResourceType, resourceId: string) {
  const state = await loadState(resourceType, resourceId);
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("permanently_delete_website_content", { p_resource_type: resourceType, p_resource_id: resourceId, p_expected_revision: state.revision } as never);
  if (error) throw new Error(error.message);
}

export function toScheduleTimestamp(date: string, time: string, timezone = "Asia/Kuala_Lumpur") {
  if (timezone !== "Asia/Kuala_Lumpur") throw new Error("Only Malaysia time is supported");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Choose a valid Malaysia date and time");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  if (Number.isNaN(timestamp.getTime())) throw new Error("Choose a valid Malaysia date and time");
  return timestamp.toISOString();
}

export function toMalaysiaDateTimeInput(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid Malaysia date and time");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

async function loadState(resourceType: LifecycleResourceType, resourceId: string) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("website_content_lifecycle").select("revision,status").eq("resource_type", resourceType).eq("resource_id", resourceId).single();
  if (error || !data) throw new Error("Content lifecycle state is unavailable");
  return data;
}

async function call(fn: "restore_website_content" | "trash_website_content" | "schedule_website_content", resourceType: LifecycleResourceType, resourceId: string, revision: number, scheduledAt?: string) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc(fn, { p_resource_type: resourceType, p_resource_id: resourceId, p_expected_revision: revision, ...(scheduledAt ? { p_scheduled_at: scheduledAt } : {}) } as never);
  if (error) throw new Error(error.message);
}

async function getSupabase() {
  return (await import("@/integrations/supabase/client")).supabase;
}
