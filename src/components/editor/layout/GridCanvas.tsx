import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import type {
  WebsiteGridPlacement,
  WebsiteLayout,
} from "@/features/website-cms/layout/types";
import { cn } from "@/lib/utils";

interface DragOrigin {
  blockId: string;
  clientX: number;
  clientY: number;
  placement: WebsiteGridPlacement;
}

interface GridCanvasProps<K extends string> {
  blockLabels: Record<K, string>;
  layout: WebsiteLayout<K>;
  onMove: (blockId: string, column: number, row: number) => void;
  onResize: (blockId: string, width: number, height: number) => void;
}

export function GridCanvas<K extends string>({
  blockLabels,
  layout,
  onMove,
  onResize,
}: GridCanvasProps<K>) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const maxRow = Math.max(
    4,
    ...layout.blocks.map((block) => block.desktop.row + block.desktop.height),
  );

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    blockId: string,
    placement: WebsiteGridPlacement,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();

    const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (event.shiftKey) {
      onResize(
        blockId,
        placement.width + horizontal,
        placement.height + vertical,
      );
    } else {
      onMove(
        blockId,
        placement.column + horizontal,
        placement.row + vertical,
      );
    }
  };

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    blockId: string,
    placement: WebsiteGridPlacement,
  ) => {
    dragOrigin.current = {
      blockId,
      clientX: event.clientX,
      clientY: event.clientY,
      placement,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const origin = dragOrigin.current;
    const canvas = canvasRef.current;
    dragOrigin.current = null;
    if (!origin || !canvas) return;

    const columnWidth = canvas.getBoundingClientRect().width / 12;
    const columnDelta = Math.round((event.clientX - origin.clientX) / columnWidth);
    const rowDelta = Math.round((event.clientY - origin.clientY) / 56);
    if (columnDelta !== 0 || rowDelta !== 0) {
      onMove(
        origin.blockId,
        origin.placement.column + columnDelta,
        origin.placement.row + rowDelta,
      );
    }
  };

  return (
    <div
      aria-label="Desktop 12-column layout canvas"
      className="relative grid min-h-80 grid-cols-12 gap-1 overflow-auto rounded-xl border border-blue-200 bg-blue-50/60 p-3"
      ref={canvasRef}
      role="group"
      style={{ gridAutoRows: "56px", gridTemplateRows: `repeat(${maxRow}, 56px)` }}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <div
          aria-hidden="true"
          className="pointer-events-none col-span-1 row-start-1 rounded border border-blue-100 bg-white/60"
          key={index}
          style={{ gridColumnStart: index + 1, gridRowEnd: maxRow + 1 }}
        />
      ))}
      {[...layout.blocks]
        .sort((left, right) => left.order - right.order)
        .map((block) => (
          <button
            aria-label={`${blockLabels[block.kind]} block, column ${block.desktop.column}, width ${block.desktop.width}, row ${block.desktop.row}`}
            className={cn(
              "relative z-10 flex min-h-11 cursor-grab items-start justify-between rounded-lg border-2 border-blue-500 bg-blue-100 p-3 text-left text-sm font-semibold text-blue-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 active:cursor-grabbing",
              block.hidden && "border-dashed opacity-55",
            )}
            key={block.id}
            onKeyDown={(event) => handleKeyDown(event, block.id, block.desktop)}
            onPointerDown={(event) =>
              handlePointerDown(event, block.id, block.desktop)
            }
            onPointerUp={handlePointerUp}
            style={{
              gridColumn: `${block.desktop.column} / span ${block.desktop.width}`,
              gridRow: `${block.desktop.row} / span ${block.desktop.height}`,
            }}
            type="button"
          >
            <span>{blockLabels[block.kind]}</span>
            <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">
              {block.order + 1}
            </span>
          </button>
        ))}
    </div>
  );
}
