import { Menu } from "lucide-react";

import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function EditorMobileNavigation({
  canManageTrackingSettings,
}: {
  canManageTrackingSettings: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Open editor menu"
          className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[19rem] border-slate-800 bg-slate-950 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Website editor menu</SheetTitle>
          <SheetDescription>Navigate between website editing areas.</SheetDescription>
        </SheetHeader>
        <EditorSidebar canManageTrackingSettings={canManageTrackingSettings} />
      </SheetContent>
    </Sheet>
  );
}
