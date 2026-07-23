import { websiteLayoutSchema } from "./schema";
import type {
  WebsiteGridPlacement,
  WebsiteLayout,
  WebsiteLayoutBlock,
} from "./types";

type LayoutKinds = readonly [string, ...string[]];

export type LayoutCommandResult<K extends string = string> =
  | { ok: true; layout: WebsiteLayout<K> }
  | { ok: false; layout: WebsiteLayout<K>; reason: string };

export interface LayoutHistory<K extends string = string> {
  past: WebsiteLayout<K>[];
  present: WebsiteLayout<K>;
  future: WebsiteLayout<K>[];
}

function copyLayout<K extends string>(
  layout: WebsiteLayout<K>,
): WebsiteLayout<K> {
  return {
    version: 1,
    blocks: layout.blocks.map((block) => ({
      ...block,
      desktop: { ...block.desktop },
    })),
  };
}

function validateCandidate<const Kinds extends LayoutKinds>(
  current: WebsiteLayout<Kinds[number]>,
  candidate: WebsiteLayout<Kinds[number]>,
  kinds: Kinds,
): LayoutCommandResult<Kinds[number]> {
  const result = websiteLayoutSchema(kinds).safeParse(candidate);
  if (result.success) {
    return {
      ok: true,
      layout: result.data as WebsiteLayout<Kinds[number]>,
    };
  }

  return {
    ok: false,
    layout: current,
    reason: result.error.issues[0]?.message ?? "Layout change is invalid",
  };
}

function updateBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  update: (
    block: WebsiteLayoutBlock<Kinds[number]>,
  ) => WebsiteLayoutBlock<Kinds[number]>,
  kinds: Kinds,
): LayoutCommandResult<Kinds[number]> {
  if (!layout.blocks.some((block) => block.id === blockId)) {
    return { ok: false, layout, reason: "Block was not found" };
  }

  const candidate = copyLayout(layout);
  candidate.blocks = candidate.blocks.map((block) =>
    block.id === blockId ? update(block) : block,
  );
  return validateCandidate(layout, candidate, kinds);
}

export function moveBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  placement: Pick<WebsiteGridPlacement, "column" | "row">,
  kinds: Kinds,
) {
  return updateBlock(
    layout,
    blockId,
    (block) => ({
      ...block,
      desktop: { ...block.desktop, ...placement },
    }),
    kinds,
  );
}

export function resizeBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  size: Pick<WebsiteGridPlacement, "width" | "height">,
  kinds: Kinds,
) {
  return updateBlock(
    layout,
    blockId,
    (block) => ({
      ...block,
      desktop: { ...block.desktop, ...size },
    }),
    kinds,
  );
}

export function reorderBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  nextOrder: number,
  kinds: Kinds,
) {
  const ordered = [...layout.blocks].sort((left, right) => left.order - right.order);
  const currentIndex = ordered.findIndex((block) => block.id === blockId);
  if (currentIndex < 0) {
    return { ok: false as const, layout, reason: "Block was not found" };
  }
  if (nextOrder < 0 || nextOrder >= ordered.length) {
    return { ok: false as const, layout, reason: "Block order is out of range" };
  }

  const [selected] = ordered.splice(currentIndex, 1);
  ordered.splice(nextOrder, 0, selected);
  const candidate: WebsiteLayout<Kinds[number]> = {
    version: 1,
    blocks: ordered.map((block, order) => ({
      ...block,
      order,
      desktop: { ...block.desktop },
    })),
  };
  return validateCandidate(layout, candidate, kinds);
}

export function setBlockHidden<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  hidden: boolean,
  kinds: Kinds,
) {
  return updateBlock(layout, blockId, (block) => ({ ...block, hidden }), kinds);
}

export function duplicateBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  identity: { id: string; contentRef: string },
  kinds: Kinds,
) {
  const source = layout.blocks.find((block) => block.id === blockId);
  if (!source) {
    return { ok: false as const, layout, reason: "Block was not found" };
  }

  const nextRow = layout.blocks.reduce(
    (maximum, block) =>
      Math.max(maximum, block.desktop.row + block.desktop.height),
    1,
  );
  const candidate = copyLayout(layout);
  candidate.blocks.push({
    ...source,
    ...identity,
    order: candidate.blocks.length,
    desktop: { ...source.desktop, column: 1, row: nextRow },
  });
  return validateCandidate(layout, candidate, kinds);
}

export function deleteBlock<const Kinds extends LayoutKinds>(
  layout: WebsiteLayout<Kinds[number]>,
  blockId: string,
  protectedBlockIds: ReadonlySet<string>,
  kinds: Kinds,
) {
  if (protectedBlockIds.has(blockId)) {
    return { ok: false as const, layout, reason: "This block is required" };
  }
  if (!layout.blocks.some((block) => block.id === blockId)) {
    return { ok: false as const, layout, reason: "Block was not found" };
  }

  const candidate: WebsiteLayout<Kinds[number]> = {
    version: 1,
    blocks: layout.blocks
      .filter((block) => block.id !== blockId)
      .sort((left, right) => left.order - right.order)
      .map((block, order) => ({
        ...block,
        order,
        desktop: { ...block.desktop },
      })),
  };
  return validateCandidate(layout, candidate, kinds);
}

export function createLayoutHistory<K extends string>(
  layout: WebsiteLayout<K>,
): LayoutHistory<K> {
  return { past: [], present: copyLayout(layout), future: [] };
}

export function applyLayoutChange<K extends string>(
  history: LayoutHistory<K>,
  layout: WebsiteLayout<K>,
): LayoutHistory<K> {
  return {
    past: [...history.past, history.present].slice(-50),
    present: copyLayout(layout),
    future: [],
  };
}

export function undoLayout<K extends string>(
  history: LayoutHistory<K>,
): LayoutHistory<K> {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoLayout<K extends string>(
  history: LayoutHistory<K>,
): LayoutHistory<K> {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-50),
    present: next,
    future: history.future.slice(1),
  };
}
