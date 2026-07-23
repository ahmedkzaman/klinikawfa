import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DesktopLayoutRow,
  DesktopRowPreset,
} from "@/features/website-cms/layout/rows";
import {
  assignDesktopRowSlot,
  reorderDesktopRow,
  setDesktopRowPreset,
} from "@/features/website-cms/layout/rows";
import { desktopRowPresetOptions } from "@/features/website-cms/layout/rows";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";

interface DesktopRowBuilderProps<K extends string> {
  blockLabels: Record<K, string>;
  layout: WebsiteLayout<K>;
  onChange: (nextRows: DesktopLayoutRow[]) => void;
  rows: DesktopLayoutRow[];
}

const presetLabel: Record<DesktopRowPreset, string> = {
  custom: "Custom",
  full: "Full",
  "two-equal": "Two equal",
  "three-equal": "Three equal",
  "four-equal": "Four equal",
  "narrow-wide": "Narrow + wide",
  "wide-narrow": "Wide + narrow",
};

const EMPTY_SLOT_VALUE = "__empty_slot__";

function slotLabel(index: number) {
  return `Slot ${index + 1}`;
}

export function DesktopRowBuilder<K extends string>({
  blockLabels,
  layout,
  onChange,
  rows,
}: DesktopRowBuilderProps<K>) {
  const visibleBlocks = useMemo(
    () =>
      [...layout.blocks]
        .filter((block) => !block.hidden)
        .sort((left, right) => left.order - right.order),
    [layout.blocks],
  );
  const labels = useMemo(
    () =>
      Object.fromEntries(
        visibleBlocks.map((block) => [block.id, blockLabels[block.kind] ?? block.id]),
      ),
    [blockLabels, visibleBlocks],
  );
  const assignedIds = useMemo(
    () =>
      new Set(
        rows.flatMap((row) =>
          row.slots.map((slot) => slot.blockId).filter(Boolean),
        ),
      ),
    [rows],
  );

  const choices = useMemo(
    () =>
      [
        { id: EMPTY_SLOT_VALUE, label: "Empty" },
        ...visibleBlocks.map((block) => ({ id: block.id, label: labels[block.id] })),
      ],
    [labels, visibleBlocks],
  );

  const addRow = () => {
    onChange([
      ...rows,
      {
        id: `row-${rows.length + 1}-${Date.now()}`,
        sourceRow: rows.length + 1,
        preset: "full",
        slots: [{ column: 1, width: 12, blockId: null }],
      },
    ]);
  };

  return (
    <TooltipProvider>
      <section aria-label="Desktop row builder" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Desktop row builder</h3>
          <Button
            aria-label="Add desktop row"
            onClick={addRow}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
            Add row
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((row, rowIndex) => {
            const localAssigned = new Set<string>();
            return (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">Row {rowIndex + 1}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.preset}
                      onValueChange={(nextPreset) =>
                        onChange(setDesktopRowPreset(rows, row.id, nextPreset as DesktopRowPreset))
                      }
                    >
                      <SelectTrigger aria-label={`Choose row ${rowIndex + 1} preset`} className="h-8 px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {desktopRowPresetOptions.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {presetLabel[preset]}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Move Row ${rowIndex + 1} up`}
                          disabled={rowIndex === 0}
                          onClick={() =>
                            onChange(reorderDesktopRow(rows, row.id, rowIndex - 1))
                          }
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <ChevronUp aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Move row up</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Move Row ${rowIndex + 1} down`}
                          disabled={rowIndex === rows.length - 1}
                          onClick={() =>
                            onChange(reorderDesktopRow(rows, row.id, rowIndex + 1))
                          }
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Move row down</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Delete Row ${rowIndex + 1}`}
                          onClick={() =>
                            onChange(rows.filter((candidate) => candidate.id !== row.id))
                          }
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete row</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="grid gap-2">
                  {row.slots.map((slot, slotIndex) => {
                    const rowOptions = choices.filter(({ id }) => {
                      if (id === EMPTY_SLOT_VALUE) return true;
                      if (id === slot.blockId) return true;
                      if (assignedIds.has(id)) return false;
                      if (localAssigned.has(id)) return false;
                      return true;
                    });
                    if (slot.blockId) localAssigned.add(slot.blockId);

                    return (
                      <div
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"
                        key={`${row.id}-slot-${slotIndex}`}
                      >
                        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                          {slotLabel(slotIndex)}
                        </div>
                        <Select
                          value={slot.blockId ?? EMPTY_SLOT_VALUE}
                          onValueChange={(selected) => {
                            onChange(
                              assignDesktopRowSlot(
                                rows,
                                row.id,
                                slotIndex,
                                selected === EMPTY_SLOT_VALUE ? null : selected,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger aria-label={`${slotLabel(slotIndex)} block`} className="h-8 text-xs">
                            <SelectValue>{slot.blockId ? labels[slot.blockId] : "Empty"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {rowOptions.map(({ id, label }) => (
                              <SelectItem key={id} value={id}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
}
