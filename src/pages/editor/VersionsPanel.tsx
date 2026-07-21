import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  fetchPageVersions,
  restorePageVersionToDraft,
  type WebsitePageVersionSummary,
} from "@/features/website-cms/api/pages";

interface VersionsPanelProps {
  onRestored: () => Promise<void> | void;
  pageId: string;
}

const versionDateFormatter = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

export function VersionsPanel({ onRestored, pageId }: VersionsPanelProps) {
  const [versions, setVersions] = useState<WebsitePageVersionSummary[]>([]);
  const [selected, setSelected] = useState<WebsitePageVersionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setVersions(await fetchPageVersions(pageId));
    } catch {
      setError("Version history could not be loaded. Try again.");
    } finally {
      setIsLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const restoreSelectedVersion = async () => {
    if (!selected) return;
    setIsRestoring(true);
    setError(null);
    try {
      await restorePageVersionToDraft({
        pageId,
        versionId: selected.id,
      });
      setSelected(null);
      await onRestored();
      await loadVersions();
    } catch {
      setError("That version could not be restored. The current draft was not changed.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <section
      aria-labelledby="home-version-history-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
          <History aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 id="home-version-history-title" className="font-semibold text-slate-900">
            Version history
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Restoring a published version replaces only the private draft. The live Home page stays unchanged until you publish again.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p>{error}</p>
          {versions.length === 0 && (
            <Button className="mt-3" onClick={() => void loadVersions()} size="sm" type="button" variant="outline">
              Retry history
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Loading version history
        </div>
      ) : versions.length === 0 ? (
        !error && <p className="mt-4 text-sm text-slate-600">No earlier published versions yet.</p>
      ) : (
        <ol className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {versions.map((version) => (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={version.id}>
              <div>
                <p className="text-sm font-medium text-slate-900">Revision {version.revision}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {versionDateFormatter.format(new Date(version.publishedAt))}
                </p>
              </div>
              <Button
                aria-label={`Restore revision ${version.revision} to draft`}
                className="gap-2"
                onClick={() => setSelected(version)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Restore to draft
              </Button>
            </li>
          ))}
        </ol>
      )}

      <AlertDialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore revision {selected?.revision}?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current private draft with revision {selected?.revision}. It does not change the live Home page. Any unsaved local form changes will be discarded when the restored draft reloads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              aria-label={`Restore revision ${selected?.revision ?? ""}`.trim()}
              disabled={isRestoring}
              onClick={(event) => {
                event.preventDefault();
                void restoreSelectedVersion();
              }}
            >
              {isRestoring && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              Restore revision {selected?.revision}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
