import { Button } from "@/components/ui/button";

export function ContentBulkActions({
  selectedCount,
  busy,
  onApply,
}: {
  selectedCount: number;
  busy: boolean;
  onApply: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span className="text-sm text-slate-600">
        {selectedCount} selected
      </span>
      <span className="text-sm font-medium text-slate-800">Move to Trash</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Apply bulk action"
        disabled={selectedCount === 0 || busy}
        onClick={() => void onApply()}
      >
        Apply
      </Button>
    </div>
  );
}
