import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { EditorDirtyNavigationProvider } from "../../../../src/components/editor/EditorDirtyNavigation";
import { DirtyNavigationHarness } from "./DirtyNavigationHarness";

type Direction = "back" | "forward";

type NavigationApi = {
  currentEntry?: { key?: string } | null;
};

declare global {
  interface Window {
    __dirtyNavigationAcceptedKey: string | null;
    __dirtyNavigationUnmounts: number;
    __dirtyNavigationVisits: Array<{
      key: string | null;
      state: unknown;
      url: string;
    }>;
  }
}

function navigationKey() {
  const navigation = (window as unknown as { navigation?: NavigationApi })
    .navigation;
  const key = navigation?.currentEntry?.key;
  return typeof key === "string" ? key : null;
}

function entryUrl(direction: Direction, entry: string) {
  return `${window.location.pathname}?scenario=${direction}&entry=${entry}`;
}

const direction =
  new URLSearchParams(window.location.search).get("scenario") === "forward"
    ? "forward"
    : "back";

window.__dirtyNavigationVisits = [];
window.addEventListener("popstate", (event) => {
  window.__dirtyNavigationVisits.push({
    key: navigationKey(),
    state: event.state,
    url: window.location.href,
  });
});

function mountHarness() {
  window.__dirtyNavigationAcceptedKey = navigationKey();
  window.__dirtyNavigationUnmounts = 0;
  window.__dirtyNavigationVisits = [];
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <EditorDirtyNavigationProvider>
        <DirtyNavigationHarness direction={direction} />
      </EditorDirtyNavigationProvider>
    </BrowserRouter>,
  );
}

if (direction === "back") {
  window.history.replaceState(null, "", entryUrl(direction, "legacy-back"));
  window.history.pushState(
    { idx: 1, key: "editor-entry", usr: null },
    "",
    entryUrl(direction, "editor"),
  );
  mountHarness();
} else {
  window.history.replaceState(
    { idx: 0, key: "editor-entry", usr: null },
    "",
    entryUrl(direction, "editor"),
  );
  window.history.pushState(
    null,
    "",
    entryUrl(direction, "legacy-forward"),
  );
  window.addEventListener("popstate", mountHarness, { once: true });
  window.history.back();
}
