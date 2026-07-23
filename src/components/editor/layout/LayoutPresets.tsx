import { Columns2, Columns3, PanelLeft, PanelRight, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LayoutPreset } from "./presets";

export function LayoutPresets({
  onApply,
}: {
  onApply: (preset: LayoutPreset) => void;
}) {
  const presets = [
    { id: "full-width", label: "Full width", icon: Rows3 },
    { id: "two-columns", label: "Two equal columns", icon: Columns2 },
    { id: "three-columns", label: "Three equal columns", icon: Columns3 },
    { id: "sidebar-content", label: "Sidebar then content", icon: PanelLeft },
    { id: "content-sidebar", label: "Content then sidebar", icon: PanelRight },
  ] as const;

  return (
    <div aria-label="Layout presets" className="flex flex-wrap gap-2" role="group">
      {presets.map(({ id, label, icon: Icon }) => (
        <Button
          aria-label={label}
          className="min-h-11"
          key={id}
          onClick={() => onApply(id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Icon aria-hidden="true" className="mr-2 h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  );
}
