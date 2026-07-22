import { z } from "zod";

const allowedRoutes = new Set(["/","/services","/doctors","/doctor-on-duty","/appointment","/gallery","/health-tips","/privacy","/terms"]);
export const navigationHrefSchema = z.string().trim().max(2048).refine((value) => {
  if (allowedRoutes.has(value) || /^\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:"; } catch { return false; }
}, "Use an approved website route or HTTPS URL");

export const navigationItemSchema = z.object({
  id: z.string().uuid(), parentId: z.string().uuid().nullable(), href: navigationHrefSchema,
  labelMs: z.string().trim().min(1).max(120), labelEn: z.string().trim().max(120).default(""),
  visible: z.boolean(), displayOrder: z.number().int().min(0).max(10_000),
}).strict();

export const navigationDraftSchema = z.array(navigationItemSchema).max(40).superRefine((items, context) => {
  const ids = new Set(items.map((item) => item.id));
  const visiblePositions = new Set<number>();
  items.forEach((item, index) => {
    if (item.parentId === item.id) context.addIssue({ code:z.ZodIssueCode.custom,path:[index,"parentId"],message:"An item cannot be its own parent" });
    if (item.parentId && !ids.has(item.parentId)) context.addIssue({ code:z.ZodIssueCode.custom,path:[index,"parentId"],message:"Parent item is missing" });
    if (item.parentId && items.find((candidate)=>candidate.id===item.parentId)?.parentId) context.addIssue({ code:z.ZodIssueCode.custom,path:[index,"parentId"],message:"Only one submenu level is allowed" });
    if (item.visible && !item.parentId) { if (visiblePositions.has(item.displayOrder)) context.addIssue({ code:z.ZodIssueCode.custom,path:[index,"displayOrder"],message:"Visible top-level positions must be unique" }); visiblePositions.add(item.displayOrder); }
  });
});
export type NavigationDraftItem = z.infer<typeof navigationItemSchema>;
