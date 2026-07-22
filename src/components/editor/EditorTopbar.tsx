import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { EditorMobileNavigation } from "@/components/editor/EditorMobileNavigation";
import { Button } from "@/components/ui/button";

export function EditorTopbar({
  canManageTrackingSettings,
  onSignOut,
}: {
  canManageTrackingSettings: boolean;
  onSignOut: () => Promise<void>;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <EditorMobileNavigation
          canManageTrackingSettings={canManageTrackingSettings}
        />
        <Link
          to="/editor"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Klinik Awfa</span>
            <span className="block text-xs text-slate-400">Website Editor</span>
          </span>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-slate-700 bg-transparent text-white hover:bg-slate-800 hover:text-white"
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
