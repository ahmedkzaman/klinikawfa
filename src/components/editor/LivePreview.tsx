import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Monitor, Smartphone, Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewMode = "desktop" | "tablet" | "mobile";

const PREVIEW_WIDTHS: Record<PreviewMode, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

const PREVIEW_DOCUMENT = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <style>html, body, #live-preview-root { min-height: 100%; margin: 0; }</style>
  </head>
  <body><div id="live-preview-root"></div></body>
</html>`;

interface LivePreviewProps {
  children: ReactNode;
  title: string;
}

function ensurePreviewRoot(frame: HTMLIFrameElement) {
  const previewDocument = frame.contentDocument;
  if (!previewDocument) return null;

  let robots = previewDocument.head.querySelector<HTMLMetaElement>(
    'meta[name="robots"]',
  );
  if (!robots) {
    robots = previewDocument.createElement("meta");
    robots.name = "robots";
    previewDocument.head.append(robots);
  }
  robots.content = "noindex, nofollow";

  let root = previewDocument.getElementById("live-preview-root");
  if (!root) {
    root = previewDocument.createElement("div");
    root.id = "live-preview-root";
    previewDocument.body.append(root);
  }

  root.setAttribute("inert", "");
  (root as HTMLElement & { inert: boolean }).inert = true;
  return root;
}

function syncThemeAttributes(target: HTMLElement) {
  const source = document.documentElement;
  const sourceNames = new Set(source.getAttributeNames());

  target.getAttributeNames().forEach((name) => {
    if (!sourceNames.has(name)) target.removeAttribute(name);
  });
  sourceNames.forEach((name) => {
    target.setAttribute(name, source.getAttribute(name) ?? "");
  });
}

function syncStyleNodes(previewDocument: Document) {
  previewDocument.head
    .querySelectorAll('[data-live-preview-style="true"]')
    .forEach((node) => node.remove());

  document.head
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((source) => {
      const clone = source.cloneNode(true) as Element;
      clone.setAttribute("data-live-preview-style", "true");
      previewDocument.head.append(clone);
    });
}

export function LivePreview({ children, title }: LivePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const handleFrameLoad = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setPortalRoot(ensurePreviewRoot(frame));
  }, []);

  useEffect(() => {
    if (!portalRoot) return;
    const previewDocument = portalRoot.ownerDocument;

    const secureEmbeddedContent = () => {
      portalRoot.querySelectorAll("iframe").forEach((iframe) => {
        iframe.setAttribute("sandbox", "");
        iframe.setAttribute("tabindex", "-1");
        iframe.style.pointerEvents = "none";
      });
    };
    const mirrorStyles = () => syncStyleNodes(previewDocument);
    const mirrorTheme = () => syncThemeAttributes(previewDocument.documentElement);

    mirrorStyles();
    mirrorTheme();
    secureEmbeddedContent();

    const styleObserver = new MutationObserver(mirrorStyles);
    styleObserver.observe(document.head, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    const themeObserver = new MutationObserver(mirrorTheme);
    themeObserver.observe(document.documentElement, { attributes: true });
    const contentObserver = new MutationObserver(secureEmbeddedContent);
    contentObserver.observe(portalRoot, { childList: true, subtree: true });

    return () => {
      styleObserver.disconnect();
      themeObserver.disconnect();
      contentObserver.disconnect();
      previewDocument.head
        .querySelectorAll('[data-live-preview-style="true"]')
        .forEach((node) => node.remove());
    };
  }, [portalRoot]);

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
            aria-label="Tablet 768 px"
            aria-pressed={mode === "tablet"}
            className={cn(
              "gap-2",
              mode === "tablet" && "bg-slate-900 text-white hover:bg-slate-800",
            )}
            onClick={() => setMode("tablet")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Tablet aria-hidden="true" className="h-4 w-4" />
            Tablet
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
        <iframe
          aria-label={`${mode === "desktop" ? "Desktop" : mode === "tablet" ? "Tablet" : "Mobile"} preview canvas`}
          className="block min-h-[720px] border-0 bg-white transition-[width] duration-200"
          data-preview-mode={mode}
          data-preview-width={width}
          data-testid="live-preview-frame"
          onLoad={handleFrameLoad}
          ref={frameRef}
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin"
          srcDoc={PREVIEW_DOCUMENT}
          style={{ width: `${width}px` }}
          tabIndex={-1}
          title={`${title} viewport`}
        />
        {portalRoot &&
          createPortal(
            <div
              className="min-h-[720px] bg-background [&_iframe]:pointer-events-none"
              data-live-preview-content="true"
              onAuxClickCapture={blockMouseInteraction}
              onClickCapture={blockMouseInteraction}
              onSubmitCapture={blockSubmission}
            >
              {children}
            </div>,
            portalRoot,
          )}
      </div>
    </div>
  );
}
