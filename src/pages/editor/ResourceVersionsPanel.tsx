import { History, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  fetchResourceVersions,
  restoreResourceVersion,
  type ResourceVersion,
} from "@/features/website-cms/api/resources";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

interface ResourceVersionsPanelProps {
  disabled?: boolean;
  onRestored: () => Promise<void> | void;
  resourceId: string;
  resourceLabel: string;
  resourceType: WebsiteResourceType;
}

export function ResourceVersionsPanel({
  disabled = false,
  onRestored,
  resourceId,
  resourceLabel,
  resourceType,
}: ResourceVersionsPanelProps) {
  const [versions, setVersions] = useState<ResourceVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchResourceVersions(resourceType, resourceId)
      .then((rows) => active && setVersions(rows))
      .catch(() => active && setError("Version history could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [resourceId, resourceType]);

  const restore = async (version: ResourceVersion) => {
    if (disabled || restoring) return;
    const confirmed = window.confirm(
      `Restore revision ${version.revision} to the private draft? The live ${resourceLabel} will not change until you publish.`,
    );
    if (!confirmed) return;
    setRestoring(version.id);
    setError(null);
    try {
      await restoreResourceVersion(resourceType, resourceId, version.id);
      await onRestored();
    } catch {
      setError("That version could not be restored. The live website was not changed.");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="resource-version-history">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><History className="h-5 w-5" /></span>
        <div>
          <h2 className="font-semibold" id="resource-version-history">Version history</h2>
          <p className="mt-1 text-sm text-slate-600">Restore a published version to the private draft without changing the live website.</p>
        </div>
      </div>
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-slate-600" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading history</p>
      ) : versions.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No published versions yet.</p>
      ) : (
        <ol className="mt-4 divide-y rounded-lg border">
          {versions.map((version) => (
            <li className="flex items-center justify-between gap-4 p-4" key={version.id}>
              <div><p className="text-sm font-medium">Revision {version.revision}</p><p className="text-xs text-slate-500">{new Date(version.publishedAt).toLocaleString("en-MY")}</p></div>
              <Button disabled={disabled || restoring !== null} onClick={() => void restore(version)} size="sm" variant="outline">
                {restoring === version.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Restore to draft
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
