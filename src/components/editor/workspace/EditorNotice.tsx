import { CircleAlert, CircleCheck, Info } from "lucide-react";

import { cn } from "@/lib/utils";

interface EditorNoticeProps {
  children: React.ReactNode;
  tone?: "error" | "info" | "success" | "warning";
}

const styles = {
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
};

export function EditorNotice({ children, tone = "info" }: EditorNoticeProps) {
  const Icon = tone === "success" ? CircleCheck : tone === "info" ? Info : CircleAlert;
  return (
    <div
      className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-6", styles[tone])}
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
