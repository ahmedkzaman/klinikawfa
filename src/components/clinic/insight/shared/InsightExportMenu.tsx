import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type InsightExportItem = {
  id: string;
  label: string;
  download: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export function InsightExportMenu({ items }: { items: InsightExportItem[] }) {
  const disabledReasons = items.filter((item) => item.disabled && item.disabledReason);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="shrink-0"
          aria-label="Export"
          data-insight-export-control
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-insight-export-control>
        {items.length === 0 ? (
          <DropdownMenuItem disabled>No exports for this section</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              onSelect={(event) => {
                event.preventDefault();
                if (!item.disabled) item.download();
              }}
            >
              <span>{item.label}</span>
              {item.disabled && item.disabledReason ? <span className="sr-only"> Unavailable: {item.disabledReason}</span> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
      {disabledReasons.length > 0 ? (
        <span className="sr-only" aria-live="polite">
          {disabledReasons.map((item) => `${item.label} unavailable: ${item.disabledReason}`).join(' ')}
        </span>
      ) : null}
    </DropdownMenu>
  );
}
