import { useEffect, useState } from "react";

import { LivePreview } from "../../../../src/components/editor/LivePreview";

export function LivePreviewHarness() {
  const [theme, setTheme] = useState("clinic");

  useEffect(() => {
    document.documentElement.setAttribute("data-harness-theme", theme);
  }, [theme]);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="mb-4 text-2xl font-semibold">
        LivePreview production harness
      </h1>
      <button
        className="mb-4 rounded border px-3 py-2"
        onClick={() => setTheme("night")}
        type="button"
      >
        Update parent theme
      </button>
      <LivePreview title="Production LivePreview">
        <div className="p-4" id="cloned-style-probe">
          <p className="hidden md:block" id="tailwind-breakpoint-probe">
            Tailwind desktop breakpoint probe
          </p>
        </div>
      </LivePreview>
    </main>
  );
}
