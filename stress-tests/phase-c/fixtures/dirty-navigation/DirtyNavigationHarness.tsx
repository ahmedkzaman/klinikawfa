import { useEffect } from "react";

import { useEditorDirtyState } from "../../../../src/components/editor/useEditorDirtyNavigation";

type Direction = "back" | "forward";

export function DirtyNavigationHarness({
  direction,
}: {
  direction: Direction;
}) {
  useEditorDirtyState(true);

  useEffect(
    () => () => {
      window.__dirtyNavigationUnmounts += 1;
    },
    [],
  );

  const label = direction === "back" ? "Back" : "Forward";

  return (
    <main>
      <h1>Dirty navigation history harness</h1>
      <p>Dirty editor entry</p>
      <button onClick={() => window.history[direction]()} type="button">
        Attempt {label}
      </button>
    </main>
  );
}
