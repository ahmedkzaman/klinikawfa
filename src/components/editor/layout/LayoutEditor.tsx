import { Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  applyLayoutChange,
  createLayoutHistory,
  deleteBlock,
  moveBlock,
  redoLayout,
  reorderBlock,
  resizeBlock,
  setBlockHidden,
  undoLayout,
  type LayoutCommandResult,
} from "@/features/website-cms/layout/commands";
import type {
  WebsiteLayout,
} from "@/features/website-cms/layout/types";

import { BlockOrderPanel } from "./BlockOrderPanel";
import { GridCanvas } from "./GridCanvas";
import { LayoutPresets } from "./LayoutPresets";
import { createPresetLayout, type LayoutPreset } from "./presets";

type LayoutKinds = readonly [string, ...string[]];

interface LayoutEditorProps<Kinds extends LayoutKinds> {
  allowedKinds: Kinds;
  blockLabels: Record<Kinds[number], string>;
  layout: WebsiteLayout<Kinds[number]>;
  onChange: (layout: WebsiteLayout<Kinds[number]>) => void;
  protectedBlockIds?: ReadonlySet<string>;
}

export function LayoutEditor<const Kinds extends LayoutKinds>({
  allowedKinds,
  blockLabels,
  layout,
  onChange,
  protectedBlockIds = new Set(),
}: LayoutEditorProps<Kinds>) {
  const [history, setHistory] = useState(() => createLayoutHistory(layout));
  const [status, setStatus] = useState("Layout ready");

  useEffect(() => {
    setHistory((current) =>
      current.present === layout ? current : createLayoutHistory(layout),
    );
  }, [layout]);

  const commit = (
    result: LayoutCommandResult<Kinds[number]>,
    message: string,
  ) => {
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    setHistory((current) => applyLayoutChange(current, result.layout));
    setStatus(message);
    onChange(result.layout);
  };

  const handleUndo = () => {
    const next = undoLayout(history);
    if (next === history) return;
    setHistory(next);
    setStatus("Layout change undone");
    onChange(next.present);
  };

  const handleRedo = () => {
    const next = redoLayout(history);
    if (next === history) return;
    setHistory(next);
    setStatus("Layout change restored");
    onChange(next.present);
  };

  const applyPreset = (preset: LayoutPreset) => {
    const candidate = createPresetLayout(history.present, preset);
    commit({ ok: true, layout: candidate }, "Layout preset applied");
  };

  return (
    <section
      aria-labelledby="website-layout-editor-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Page layout
          </p>
          <h2
            className="mt-1 text-xl font-semibold text-slate-950"
            id="website-layout-editor-title"
          >
            Advanced grid designer
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Arrange the desktop grid. Tablet and mobile layouts stack safely in
            the reading order shown beside the canvas.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <LayoutPresets onApply={applyPreset} />
          <div className="flex gap-2">
            <Button
              aria-label="Undo layout change"
              disabled={history.past.length === 0}
              onClick={handleUndo}
              size="sm"
              type="button"
              variant="outline"
            >
              <Undo2 aria-hidden="true" className="mr-2 h-4 w-4" />
              Undo
            </Button>
            <Button
              aria-label="Redo layout change"
              disabled={history.future.length === 0}
              onClick={handleRedo}
              size="sm"
              type="button"
              variant="outline"
            >
              <Redo2 aria-hidden="true" className="mr-2 h-4 w-4" />
              Redo
            </Button>
            <Button
              aria-label="Reset layout"
              onClick={() =>
                commit(
                  { ok: true, layout },
                  "Layout reset to the saved arrangement",
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <GridCanvas
            blockLabels={blockLabels}
            layout={history.present}
            onMove={(blockId, column, row) =>
              commit(
                moveBlock(history.present, blockId, { column, row }, allowedKinds),
                "Block moved",
              )
            }
            onResize={(blockId, width, height) =>
              commit(
                resizeBlock(history.present, blockId, { width, height }, allowedKinds),
                "Block resized",
              )
            }
          />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Mobile and reading order
            </h3>
            <BlockOrderPanel
              blockLabels={blockLabels}
              layout={history.present}
              onDelete={(blockId) =>
                commit(
                  deleteBlock(
                    history.present,
                    blockId,
                    protectedBlockIds,
                    allowedKinds,
                  ),
                  "Block deleted",
                )
              }
              onReorder={(blockId, order) =>
                commit(
                  reorderBlock(history.present, blockId, order, allowedKinds),
                  "Reading order updated",
                )
              }
              onVisibility={(blockId, hidden) =>
                commit(
                  setBlockHidden(
                    history.present,
                    blockId,
                    hidden,
                    allowedKinds,
                  ),
                  hidden ? "Block hidden" : "Block shown",
                )
              }
              protectedBlockIds={protectedBlockIds}
            />
          </div>
        </div>

        <p
          aria-live="polite"
          className="min-h-5 text-sm font-medium text-slate-700"
          role="status"
        >
          {status}
        </p>
      </div>
    </section>
  );
}
