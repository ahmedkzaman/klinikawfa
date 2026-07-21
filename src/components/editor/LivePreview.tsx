import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Monitor, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewMode = "desktop" | "mobile";

const PREVIEW_WIDTHS: Record<PreviewMode, number> = {
  desktop: 1280,
  mobile: 390,
};

interface LivePreviewProps {
  children: ReactNode;
  title: string;
}

export function LivePreview({ children, title }: LivePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    (frame as HTMLDivElement & { inert: boolean }).inert = true;

    const secureEmbeddedContent = () => {
      frame.querySelectorAll("iframe").forEach((iframe) => {
        iframe.setAttribute("sandbox", "");
        iframe.setAttribute("tabindex", "-1");
        iframe.style.pointerEvents = "none";
      });
    };

    secureEmbeddedContent();
    const observer = new MutationObserver(secureEmbeddedContent);
    observer.observe(frame, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [children]);

  const blockMouseInteraction = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const blockSubmission = (event: FormEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const width = PREVIEW_WIDTHS[mode];

  return (
    <div
      aria-label={title}
      className="rounded-2xl border border-slate-200 bg-slate-100 p-4 shadow-inner sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="live-preview-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Unsaved form changes appear here. Preview interactions are disabled.
          </p>
        </div>
        <div
          aria-label="Preview size"
          className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1"
          role="group"
        >
          <Button
            aria-label="Desktop 1280 px"
            aria-pressed={mode === "desktop"}
            className={cn(
              "gap-2",
              mode === "desktop" && "bg-slate-900 text-white hover:bg-slate-800",
            )}
            onClick={() => setMode("desktop")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Monitor aria-hidden="true" className="h-4 w-4" />
            Desktop
          </Button>
          <Button
            aria-label="Mobile 390 px"
            aria-pressed={mode === "mobile"}
            className={cn(
              "gap-2",
              mode === "mobile" && "bg-slate-900 text-white hover:bg-slate-800",
            )}
            onClick={() => setMode("mobile")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Smartphone aria-hidden="true" className="h-4 w-4" />
            Mobile
          </Button>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-300 bg-white">
        <div
          aria-label={`${mode === "desktop" ? "Desktop" : "Mobile"} preview canvas`}
          className="min-h-[720px] origin-top-left bg-background transition-[width] duration-200 [&_iframe]:pointer-events-none"
          data-preview-mode={mode}
          data-preview-width={width}
          data-testid="live-preview-frame"
          onAuxClickCapture={blockMouseInteraction}
          onClickCapture={blockMouseInteraction}
          onSubmitCapture={blockSubmission}
          ref={frameRef}
          style={{ width: `${width}px` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
