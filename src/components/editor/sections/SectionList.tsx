import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PAGE_SECTION_REGISTRY } from "@/features/website-cms/sections/registry";
import type { PageSection } from "@/features/website-cms/sections/schema";

import { SectionEditor } from "./SectionEditor";

interface SectionListProps {
  language: "ms" | "en";
  sections: PageSection[];
  onChange(sections: PageSection[]): void;
}

function containsContent(section: PageSection) {
  return Object.entries(section).some(([key, value]) =>
    !["id", "type", "visible", "spacing", "alignment", "imagePosition"].includes(key) &&
    ((typeof value === "string" && value.trim().length > 0) || (Array.isArray(value) && value.length > 0)),
  );
}

export function SectionList({ language, sections, onChange }: SectionListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const updateAt = (index: number, section: PageSection) => onChange(sections.map((current, position) => position === index ? section : current));
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...sections];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onChange(next);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="page-sections">
        {(drop) => (
          <div className="space-y-3" ref={drop.innerRef} {...drop.droppableProps}>
            {sections.map((section, index) => {
              const label = PAGE_SECTION_REGISTRY[section.type].label;
              const isCollapsed = collapsed.has(section.id);
              return (
                <Draggable draggableId={section.id} index={index} key={section.id}>
                  {(drag) => (
                    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" ref={drag.innerRef} {...drag.draggableProps}>
                      <header className="flex flex-wrap items-center gap-2 p-3">
                        <button aria-label={`Reorder ${label}`} className="cursor-grab rounded p-2 text-slate-400 hover:bg-slate-100" type="button" {...drag.dragHandleProps}>
                          <GripVertical aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">{label}</p>
                          <p className="text-xs text-slate-500">Section {index + 1}</p>
                        </div>
                        <Button aria-label={`${section.visible ? "Hide" : "Show"} ${label}`} onClick={() => updateAt(index, { ...section, visible: !section.visible })} size="icon" type="button" variant="ghost">
                          {section.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                        </Button>
                        <Button aria-label={`Duplicate ${label}`} onClick={() => onChange([...sections.slice(0, index + 1), { ...structuredClone(section), id: crypto.randomUUID() }, ...sections.slice(index + 1)])} size="icon" type="button" variant="ghost">
                          <Copy aria-hidden="true" />
                        </Button>
                        <Button aria-label={`Remove ${label}`} onClick={() => { if (!containsContent(section) || window.confirm(`Remove this ${label} section?`)) onChange(sections.filter((_, position) => position !== index)); }} size="icon" type="button" variant="ghost">
                          <Trash2 aria-hidden="true" />
                        </Button>
                        <Button aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${label}`} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })} size="icon" type="button" variant="ghost">
                          {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
                        </Button>
                      </header>
                      {!isCollapsed && <SectionEditor language={language} onChange={(next) => updateAt(index, next)} section={section} />}
                    </article>
                  )}
                </Draggable>
              );
            })}
            {drop.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
