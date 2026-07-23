import type { CSSProperties, ReactNode } from "react";

import { parseWebsiteLayout } from "@/features/website-cms/layout/schema";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";
import { cn } from "@/lib/utils";

type LayoutKinds = readonly [string, ...string[]];

type GridStyle = CSSProperties & {
  "--website-grid-column": number;
  "--website-grid-width": number;
  "--website-grid-row": number;
  "--website-grid-height": number;
};

interface WebsiteGridRendererProps<Kinds extends LayoutKinds> {
  allowedKinds: Kinds;
  className?: string;
  fallbackLayout: WebsiteLayout<Kinds[number]>;
  layout?: unknown;
  renderBlock: Record<Kinds[number], () => ReactNode>;
}

export function WebsiteGridRenderer<const Kinds extends LayoutKinds>({
  allowedKinds,
  className,
  fallbackLayout,
  layout,
  renderBlock,
}: WebsiteGridRendererProps<Kinds>) {
  const selectedLayout =
    parseWebsiteLayout(layout, allowedKinds) ?? fallbackLayout;
  const orderedBlocks = [...selectedLayout.blocks].sort(
    (left, right) => left.order - right.order,
  );

  return (
    <div className={cn("website-grid", className)}>
      {orderedBlocks.map((block) => {
        if (block.hidden) return null;
        const render = renderBlock[block.kind];
        if (!render) return null;

        const style: GridStyle = {
          "--website-grid-column": block.desktop.column,
          "--website-grid-width": block.desktop.width,
          "--website-grid-row": block.desktop.row,
          "--website-grid-height": block.desktop.height,
        };

        return (
          <div
            className="website-grid-block"
            data-layout-kind={block.kind}
            data-testid="website-grid-block"
            key={block.id}
            style={style}
          >
            {render()}
          </div>
        );
      })}
    </div>
  );
}
