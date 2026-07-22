export interface EditorDashboardData {
  drafts: number;
  scheduled: number;
  published: number;
  trash: number;
  activity: Array<{ id: string; action: string; resourceType: string; createdAt: string }>;
}

export async function fetchEditorDashboard(): Promise<EditorDashboardData> {
  const { supabase } = await import("@/integrations/supabase/client");
  const [lifecycle, audit] = await Promise.all([
    supabase.from("website_content_lifecycle").select("status"),
    supabase.from("website_content_audit").select("id,action,resource_type,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  if (lifecycle.error || audit.error) throw new Error("Dashboard data is unavailable");
  const totals = { drafts: 0, scheduled: 0, published: 0, trash: 0 };
  for (const row of lifecycle.data ?? []) {
    if (row.status === "draft") totals.drafts += 1;
    else if (row.status === "scheduled") totals.scheduled += 1;
    else if (row.status === "published") totals.published += 1;
    else if (row.status === "trash") totals.trash += 1;
  }
  return { ...totals, activity: (audit.data ?? []).map((row) => ({ id: row.id, action: row.action, resourceType: row.resource_type, createdAt: row.created_at })) };
}
