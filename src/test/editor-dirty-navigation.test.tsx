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

  it("guards rapid intervening and invalid POP targets before the exact correction", () => {
    window.history.replaceState(
      { idx: 2, key: "editor-home", usr: null },
      "",
      "/editor/home",
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const forward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => {});
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

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { idx: "2", key: "invalid-index", usr: null },
        }),
      );
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(forward).toHaveBeenCalledTimes(2);
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
