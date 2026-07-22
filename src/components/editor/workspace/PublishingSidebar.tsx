import { CalendarClock, Eye, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentStatus } from "@/features/website-cms/domain/content";
import { toMalaysiaDateTimeInput, toScheduleTimestamp } from "@/features/website-cms/api/lifecycle";

import type { LanguageCompleteness } from "./EditorLanguageTabs";

export interface PublishingSidebarProps {
  status: ContentStatus;
  scheduledAt: string | null;
  revision: number;
  dirty: boolean;
  busy: boolean;
  completeness: LanguageCompleteness;
  onSaveDraft(): Promise<void>;
  onPreview(): void;
  onPublish(): Promise<void>;
  onSchedule(isoTimestamp: string): Promise<void>;
  onTrash(): Promise<void>;
}

function run(action: () => void | Promise<void>) {
  try {
    void Promise.resolve(action()).catch(() => undefined);
  } catch {
    // The editor surface owns and displays mutation errors.
  }
}

export function PublishingSidebar({
  status,
  scheduledAt,
  revision,
  dirty,
  busy,
  completeness,
  onSaveDraft,
  onPreview,
  onPublish,
  onSchedule,
  onTrash,
}: PublishingSidebarProps) {
  const [scheduleValue, setScheduleValue] = useState(
    scheduledAt ? toMalaysiaDateTimeInput(scheduledAt) : "",
  );
  const languagesComplete = completeness.ms.complete && completeness.en.complete;

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Publishing">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950">Publish</h2>
          <Badge className="capitalize" variant="outline">{status}</Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Revision {revision} · {dirty ? "Unsaved changes" : "All changes saved"}
        </p>
      </div>

      <div className="space-y-3 p-5">
        <Button className="w-full justify-start" disabled={busy || !dirty} onClick={() => run(onSaveDraft)} type="button" variant="outline">
          <Save aria-hidden="true" /> Save Draft
        </Button>
        <Button className="w-full justify-start" disabled={busy} onClick={onPreview} type="button" variant="outline">
          <Eye aria-hidden="true" /> Preview
        </Button>
        <Button className="w-full justify-start" disabled={busy || dirty || !languagesComplete || status === "trash"} onClick={() => run(onPublish)} type="button">
          <Send aria-hidden="true" /> Publish
        </Button>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="editor-schedule-at">
            Schedule publication
          </label>
          <Input id="editor-schedule-at" min={toMalaysiaDateTimeInput()} onChange={(event) => setScheduleValue(event.target.value)} type="datetime-local" value={scheduleValue} />
          <Button className="w-full justify-start" disabled={busy || dirty || !scheduleValue || !languagesComplete || status === "trash"} onClick={() => run(() => {
            const [date, time] = scheduleValue.split("T");
            return onSchedule(toScheduleTimestamp(date, time));
          })} type="button" variant="outline">
            <CalendarClock aria-hidden="true" /> Schedule
          </Button>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 p-4">
        <Button className="w-full justify-start text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy || status === "trash"} onClick={() => run(onTrash)} type="button" variant="ghost">
          <Trash2 aria-hidden="true" /> Move to Trash
        </Button>
      </div>
    </aside>
  );
}
