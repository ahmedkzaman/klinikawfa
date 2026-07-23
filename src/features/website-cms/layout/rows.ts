import type { WebsiteLayout } from "@/features/website-cms/layout/types";

import { WEBSITE_GRID_COLUMNS } from "@/features/website-cms/layout/types";

export type DesktopRowPreset =
  | "full"
  | "two-equal"
  | "three-equal"
  | "four-equal"
  | "narrow-wide"
  | "wide-narrow"
  | "custom";

export interface DesktopRowSlot {
  column: number;
  width: number;
  blockId: string | null;
}

export interface DesktopLayoutRow {
  id: string;
  sourceRow: number;
  preset: DesktopRowPreset;
  slots: DesktopRowSlot[];
}

export interface DesktopRowsValidationIssue {
  ok: boolean;
  duplicateBlockIds: string[];
  emptySlots: Array<{ rowId: string; slotIndex: number }>;
  hiddenAssignedBlockIds: string[];
  unassignedBlockIds: string[];
  unknownBlockIds: string[];
}

const presetColumnsByPreset: Record<Exclude<DesktopRowPreset, "custom">, number[]> = {
  full: [WEBSITE_GRID_COLUMNS],
  "two-equal": [6, 6],
  "three-equal": [4, 4, 4],
  "four-equal": [3, 3, 3, 3],
  "narrow-wide": [4, 8],
  "wide-narrow": [8, 4],
};

const presetWidths = Object.entries(presetColumnsByPreset).reduce<
  Record<Exclude<DesktopRowPreset, "custom">, { columns: number[]; widths: number[] }>
>((acc, [preset, widths]) => {
  let column = 1;
  acc[preset as Exclude<DesktopRowPreset, "custom">] = {
    widths,
    columns: widths.map((width) => {
      const slotColumn = column;
      column += width;
      return slotColumn;
    }),
  };
  return acc;
}, {} as Record<Exclude<DesktopRowPreset, "custom">, { columns: number[]; widths: number[] }>);

export const desktopRowPresetOptions: readonly DesktopRowPreset[] = [
  "full",
  "two-equal",
  "three-equal",
  "four-equal",
  "narrow-wide",
  "wide-narrow",
];

function cloneSlot(slot: DesktopRowSlot): DesktopRowSlot {
  return { ...slot };
}

function cloneRows(rows: DesktopLayoutRow[]): DesktopLayoutRow[] {
  return rows.map((row) => ({
    ...row,
    slots: row.slots.map(cloneSlot),
  }));
}

function presetMatchesRow(
  blocks: WebsiteLayout["blocks"],
  preset: Exclude<DesktopRowPreset, "custom">,
) {
  const { columns, widths } = presetWidths[preset];
  if (blocks.length !== widths.length) return false;

  return blocks.every((block, index) =>
    block.desktop.column === columns[index] && block.desktop.width === widths[index],
  );
}

export function deriveDesktopRows<K extends string>(
  layout: WebsiteLayout<K>,
): DesktopLayoutRow[] {
  const visible = [...layout.blocks]
    .filter((block) => !block.hidden)
    .sort((left, right) =>
      left.desktop.row === right.desktop.row
        ? left.desktop.column - right.desktop.column
        : left.desktop.row - right.desktop.row,
    );

  const grouped = new Map<number, typeof visible>();
  for (const block of visible) {
    const existing = grouped.get(block.desktop.row) ?? [];
    existing.push(block);
    grouped.set(block.desktop.row, existing);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sourceRow, rowBlocks]) => {
      const ordered = [...rowBlocks].sort(
        (left, right) => left.desktop.column - right.desktop.column,
      );
      const preset = (Object.keys(presetWidths) as Exclude<
        DesktopRowPreset,
        "custom"
      >[]).find((candidate) => presetMatchesRow(ordered, candidate)) ?? "custom";

      return {
        id: `row-${sourceRow}`,
        sourceRow,
        preset,
        slots: ordered.map((block) => ({
          column: block.desktop.column,
          width: block.desktop.width,
          blockId: block.id,
        })),
      };
    });
}

export function setDesktopRowPreset(
  rows: DesktopLayoutRow[],
  rowId: string,
  preset: DesktopRowPreset,
): DesktopLayoutRow[] {
  const nextRows = cloneRows(rows);
  const target = nextRows.find((row) => row.id === rowId);
  if (!target) return nextRows;
  if (preset === "custom") {
    target.preset = "custom";
    return nextRows;
  }

  const existingAssignments = target.slots.map((slot) => slot.blockId).filter(Boolean) as string[];
  const template = presetWidths[preset];
  target.preset = preset;
  target.slots = template.widths.map((width, index) => ({
    column: template.columns[index],
    width,
    blockId: existingAssignments[index] ?? null,
  }));

  return nextRows;
}

export function assignDesktopRowSlot(
  rows: DesktopLayoutRow[],
  rowId: string,
  slotIndex: number,
  blockId: string | null,
): DesktopLayoutRow[] {
  const nextRows = cloneRows(rows);
  const target = nextRows.find((row) => row.id === rowId);
  if (!target || slotIndex < 0 || slotIndex >= target.slots.length) {
    return rows;
  }

  target.slots[slotIndex] = { ...target.slots[slotIndex], blockId };
  return nextRows;
}

export function reorderDesktopRow(
  rows: DesktopLayoutRow[],
  rowId: string,
  nextIndex: number,
): DesktopLayoutRow[] {
  if (nextIndex < 0 || nextIndex >= rows.length) return rows;

  const current = rows.findIndex((row) => row.id === rowId);
  if (current < 0 || current === nextIndex) return rows;

  const nextRows = cloneRows(rows);
  const [removed] = nextRows.splice(current, 1);
  nextRows.splice(nextIndex, 0, removed);
  return nextRows;
}

export function validateDesktopRows<K extends string>(
  layout: WebsiteLayout<K>,
  rows: DesktopLayoutRow[],
): DesktopRowsValidationIssue {
  const visibleBlocks = layout.blocks.filter((block) => !block.hidden);
  const visibleIds = new Set(visibleBlocks.map((block) => block.id));
  const assignedCount = new Map<string, number>();
  const emptySlots: Array<{ rowId: string; slotIndex: number }> = [];
  const duplicateBlockIds: string[] = [];
  const hiddenAssignedBlockIds: string[] = [];
  const unknownBlockIds = new Set<string>();

  for (const row of rows) {
    row.slots.forEach((slot, index) => {
      if (!slot.blockId) {
        emptySlots.push({ rowId: row.id, slotIndex: index });
        return;
      }

      if (visibleIds.has(slot.blockId)) {
        const count = (assignedCount.get(slot.blockId) ?? 0) + 1;
        assignedCount.set(slot.blockId, count);
        if (count > 1) {
          duplicateBlockIds.push(slot.blockId);
        }
        return;
      }

      const candidate = layout.blocks.find((block) => block.id === slot.blockId);
      if (candidate?.hidden) {
        hiddenAssignedBlockIds.push(slot.blockId);
      } else {
        unknownBlockIds.add(slot.blockId);
      }
    });
  }

  const unassignedBlockIds = [...visibleIds].filter((id) => !assignedCount.has(id));

  return {
    ok:
      duplicateBlockIds.length === 0 &&
      emptySlots.length === 0 &&
      hiddenAssignedBlockIds.length === 0 &&
      unassignedBlockIds.length === 0 &&
      unknownBlockIds.size === 0,
    duplicateBlockIds: [...new Set(duplicateBlockIds)],
    emptySlots,
    hiddenAssignedBlockIds: [...new Set(hiddenAssignedBlockIds)],
    unassignedBlockIds,
    unknownBlockIds: [...unknownBlockIds],
  };
}

export function applyDesktopRows<K extends string>(
  layout: WebsiteLayout<K>,
  rows: DesktopLayoutRow[],
): {
  ok: boolean;
  layout: WebsiteLayout<K>;
  validation: DesktopRowsValidationIssue;
} {
  const validation = validateDesktopRows(layout, rows);
  if (!validation.ok) {
    return { ok: false, layout, validation };
  }

  const byId = new Map(layout.blocks.filter((block) => !block.hidden).map((block) => [block.id, block]));
  const hidden = layout.blocks
    .filter((block) => block.hidden)
    .sort((left, right) => left.order - right.order);

  const nextVisible: WebsiteLayout<K>["blocks"] = [];
  let cursorRow = 1;

  for (const row of rows) {
    const rowHeight = Math.max(
      1,
      ...row.slots
        .map((slot) => slot.blockId)
        .filter(Boolean)
        .map((blockId) => byId.get(blockId as string)!.desktop.height),
    );

    for (const slot of row.slots) {
      if (!slot.blockId) continue;
      const block = byId.get(slot.blockId);
      if (!block) continue;

      nextVisible.push({
        ...block,
        order: nextVisible.length,
        desktop: {
          ...block.desktop,
          column: slot.column,
          width: slot.width,
          row: cursorRow,
        },
      });
    }

    cursorRow += rowHeight;
  }

  const nextBlocks = [
    ...nextVisible,
    ...hidden.map((block, index) => ({
      ...block,
      order: nextVisible.length + index,
    })),
  ];

  return {
    ok: true,
    layout: {
      version: 1,
      blocks: nextBlocks,
    },
    validation,
  };
}
