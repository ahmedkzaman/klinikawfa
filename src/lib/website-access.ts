import type { AppRole } from "@/contexts/AuthContext";

const WEBSITE_ADMIN_ROLES: readonly AppRole[] = [
  "admin",
  "special_admin",
  "doctor_admin",
];

export function isWebsiteEditorRole(role: AppRole | null): boolean {
  return role === "website_editor";
}

export function canManageWebsiteRole(role: AppRole | null): boolean {
  return isWebsiteEditorRole(role) || WEBSITE_ADMIN_ROLES.includes(role as AppRole);
}

export function canManageTrackingSettingsRole(role: AppRole | null): boolean {
  return canManageWebsiteRole(role);
}
