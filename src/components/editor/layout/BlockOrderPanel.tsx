import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";

interface BlockOrderPanelProps<K extends string> {
  blockLabels: Record<K, string>;
  layout: WebsiteLayout<K>;
  onDelete: (blockId: string) => void;
  onReorder: (blockId: string, order: number) => void;
  onVisibility: (blockId: string, hidden: boolean) => void;
  protectedBlockIds: ReadonlySet<string>;
}

export function BlockOrderPanel<K extends string>({
  blockLabels,
  layout,
  onDelete,
  onReorder,
  onVisibility,
  protectedBlockIds,
}: BlockOrderPanelProps<K>) {
  const ordered = [...layout.blocks].sort((left, right) => left.order - right.order);

  return (
    <ol aria-label="Mobile and reading order" className="space-y-2">
      {ordered.map((block, index) => {
        const label = blockLabels[block.kind];
        return (
          <li
            className="rounded-lg border border-slate-200 bg-white p-3"
            key={block.id}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="font-medium text-slate-900">{label}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <Button
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => onReorder(block.id, index - 1)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`Move ${label} down`}
                  disabled={index === ordered.length - 1}
                  onClick={() => onReorder(block.id, index + 1)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`${block.hidden ? "Show" : "Hide"} ${label}`}
                  onClick={() => onVisibility(block.id, !block.hidden)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {block.hidden ? (
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <EyeOff aria-hidden="true" className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  aria-label={`Delete ${label}`}
                  disabled={protectedBlockIds.has(block.id)}
                  onClick={() => onDelete(block.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
