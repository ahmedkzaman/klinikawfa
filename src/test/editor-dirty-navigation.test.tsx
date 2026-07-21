import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useEditorDirtyNavigation,
  useEditorDirtyState,
} from "@/components/editor/useEditorDirtyNavigation";
import { EditorLayout } from "@/components/editor/EditorLayout";

const authState = vi.hoisted(() => ({
  canManageTrackingSettings: false,
  signOut: vi.fn(),
}));
const dirtyHomeUnmount = vi.fn();
const originalNavigationDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "navigation",
);

function installNavigationStub(key: string) {
  const navigation = {
    currentEntry: { key },
    traverseTo: vi.fn(),
  };
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: navigation,
  });
  return navigation;
}

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function DirtyHome() {
  useEditorDirtyState(true);
  const { navigateSafely } = useEditorDirtyNavigation();

  useEffect(() => () => dirtyHomeUnmount(), []);

  return (
    <div>
      <p>Dirty Home editor</p>
      <Link to="/editor/pages">Internal editor link</Link>
      <a href="/services" target="_blank" rel="noreferrer">
        Public new tab
      </a>
      <a href="https://example.com" target="_blank" rel="noreferrer">
        External new tab
      </a>
      <button onClick={() => navigateSafely("/editor/pages")} type="button">
        Programmatic pages
      </button>
      <LocationProbe />
    </div>
  );
}

function renderEditorRouter() {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/editor" element={<EditorLayout />}>
          <Route path="home" element={<DirtyHome />} />
          <Route
            path="pages"
            element={
              <div>
                Pages destination
                <LocationProbe />
              </div>
            }
          />
        </Route>
        <Route
          path="/auth"
          element={
            <div>
              Auth destination
              <LocationProbe />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>,
  );
}

function setCurrentEditorEntry() {
  window.history.replaceState(
    { idx: 0, key: "editor-home", usr: null },
    "",
    "/editor/home",
  );
}

function setEditorEntryWithBackTarget() {
  window.history.replaceState(
    { idx: 0, key: "editor-pages", usr: null },
    "",
    "/editor/pages",
  );
  window.history.pushState(
    { idx: 1, key: "editor-home", usr: null },
    "",
    "/editor/home",
  );
}

beforeEach(() => {
  authState.signOut.mockReset().mockResolvedValue(undefined);
  dirtyHomeUnmount.mockReset();
  setCurrentEditorEntry();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalNavigationDescriptor) {
    Object.defineProperty(window, "navigation", originalNavigationDescriptor);
  } else {
    Reflect.deleteProperty(window, "navigation");
  }
});

describe("Editor dirty navigation", () => {
  it("guards same-tab anchors and programmatic navigation while exempting new tabs", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditorRouter();

    expect(
      window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ).toBe(false);

    expect(
      fireEvent.click(screen.getByRole("link", { name: "Internal editor link" })),
    ).toBe(false);
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(confirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Programmatic pages" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(confirm).toHaveBeenCalledTimes(2);

    expect(
      fireEvent.click(screen.getByRole("link", { name: "Public new tab" })),
    ).toBe(true);
    expect(
      fireEvent.click(screen.getByRole("link", { name: "External new tab" })),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("confirms before sign-out and performs no auth mutation when cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditorRouter();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(authState.signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
  });

  it("allows accepted sign-out without a second prompt", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditorRouter();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(authState.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Auth destination")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("allows accepted programmatic navigation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditorRouter();

    fireEvent.click(screen.getByRole("button", { name: "Programmatic pages" }));

    expect(await screen.findByText("Pages destination")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/editor/pages");
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("rolls back a cancelled POP exactly once without re-entrant confirmation", async () => {
    setEditorEntryWithBackTarget();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditorRouter();

    window.history.back();

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe("/editor/home"));
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(dirtyHomeUnmount).not.toHaveBeenCalled();
  });

  it("guards rapid intervening POP targets before the exact correction", () => {
    window.history.replaceState(
      { idx: 2, key: "editor-home", usr: null },
      "",
      "/editor/home",
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    renderEditorRouter();

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: 1, key: "first-back", usr: null },
        }),
      );
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenLastCalledWith(1);

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: 0, key: "rapid-back", usr: null },
        }),
      );
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenLastCalledWith(2);
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(dirtyHomeUnmount).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: 2, key: "expected-correction", usr: null },
        }),
      );
    });
    expect(confirm).toHaveBeenCalledTimes(2);

    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(dirtyHomeUnmount).not.toHaveBeenCalled();
  });

  it.each([
    ["Back", { idx: "1", key: "legacy-back", usr: null }, "legacy-back"],
    ["Forward", null, "legacy-forward"],
  ])(
    "returns a cancelled invalid-index %s POP to the exact accepted entry",
    (_direction, state, targetKey) => {
      window.history.replaceState(
        { idx: 2, key: "editor-home", usr: null },
        "",
        "/editor/home",
      );
      const navigation = installNavigationStub("accepted-editor-entry");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const forward = vi
        .spyOn(window.history, "forward")
        .mockImplementation(() => {});
      renderEditorRouter();

      navigation.currentEntry = { key: targetKey };
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      });

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(navigation.traverseTo).toHaveBeenCalledOnce();
      expect(navigation.traverseTo).toHaveBeenCalledWith(
        "accepted-editor-entry",
      );
      expect(forward).not.toHaveBeenCalled();
      expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
      expect(dirtyHomeUnmount).not.toHaveBeenCalled();
    },
  );

  it("requires the exact accepted key as well as the accepted index for a correction", () => {
    window.history.replaceState(
      { idx: 2, key: "editor-home", usr: null },
      "",
      "/editor/home",
    );
    const navigation = installNavigationStub("accepted-editor-entry");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.spyOn(window.history, "go").mockImplementation(() => {});
    renderEditorRouter();

    navigation.currentEntry = { key: "legacy-forward" };
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);

    navigation.currentEntry = { key: "intervening-entry" };
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: 2, key: "same-index-wrong-entry", usr: null },
        }),
      );
    });
    expect(confirm).toHaveBeenCalledTimes(2);

    navigation.currentEntry = { key: "accepted-editor-entry" };
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: 2, key: "editor-home", usr: null },
        }),
      );
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(dirtyHomeUnmount).not.toHaveBeenCalled();
  });

  it("fails closed to the accepted editor route when exact traversal is unavailable", () => {
    Reflect.deleteProperty(window, "navigation");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const forward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => {});
    renderEditorRouter();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/editor/home");
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/home");
    expect(dirtyHomeUnmount).not.toHaveBeenCalled();
  });

  it("accepts POP and updates the accepted index without bouncing forward", async () => {
    setEditorEntryWithBackTarget();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditorRouter();

    window.history.back();

    expect(await screen.findByText("Pages destination")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/editor/pages");
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
