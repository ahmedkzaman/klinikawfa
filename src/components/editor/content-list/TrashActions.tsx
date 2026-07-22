import { useState } from "react";

import { Button } from "@/components/ui/button";
import * as lifecycle from "@/features/website-cms/api/lifecycle";
import type { LifecycleResourceType } from "@/features/website-cms/api/lifecycle";

export function TrashActions({ resourceId, resourceType, onChanged }: { resourceId: string; resourceType: LifecycleResourceType; onChanged?(): void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return <div className="flex flex-wrap items-center gap-2"><Button disabled={busy} onClick={() => { setBusy(true); void lifecycle.restore(resourceType, resourceId).then(() => { setNotice("Restored to Draft"); onChanged?.(); }).finally(() => setBusy(false)); }} size="sm" type="button" variant="outline">Restore</Button><Button disabled={busy} onClick={() => { if (!window.confirm("Permanently delete this item? This cannot be undone.")) return; setBusy(true); void lifecycle.permanentlyDelete(resourceType, resourceId).then(() => onChanged?.()).finally(() => setBusy(false)); }} size="sm" type="button" variant="destructive">Delete permanently</Button>{notice && <span className="text-sm text-emerald-700" role="status">{notice}</span>}</div>;
}
