import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  EditorDirtyNavigationContext,
  type DirtySource,
  type EditorDirtyNavigationValue,
} from "@/components/editor/EditorDirtyNavigationContext";

const DIRTY_DEPARTURE_MESSAGE =
  "You have unsaved Home page changes. Leave this editor section and discard them?";

function historyIndex(state: unknown) {
  if (typeof state !== "object" || state === null || !("idx" in state)) {
    return null;
  }
  const index = (state as { idx?: unknown }).idx;
  return typeof index === "number" && Number.isFinite(index) ? index : null;
}

export function EditorDirtyNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const sourcesRef = useRef(new Map<DirtySource, boolean>());
  const dirtyRef = useRef(false);
  const acceptedIndexRef = useRef<number | null>(
    historyIndex(window.history.state),
  );
  const correctingPopRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  const refreshDirtyState = useCallback(() => {
    const nextDirty = [...sourcesRef.current.values()].some(Boolean);
    dirtyRef.current = nextDirty;
    setIsDirty(nextDirty);
  }, []);

  const setDirtySource = useCallback(
    (source: DirtySource, dirty: boolean) => {
      sourcesRef.current.set(source, dirty);
      refreshDirtyState();
    },
    [refreshDirtyState],
  );

  const removeDirtySource = useCallback(
    (source: DirtySource) => {
      sourcesRef.current.delete(source);
      refreshDirtyState();
    },
    [refreshDirtyState],
  );

  const confirmDeparture = useCallback(
    () => !dirtyRef.current || window.confirm(DIRTY_DEPARTURE_MESSAGE),
    [],
  );

  const navigateSafely = useCallback(
    (to: To, options?: NavigateOptions) => {
      if (!confirmDeparture()) return false;
      navigate(to, options);
      return true;
    },
    [confirmDeparture, navigate],
  );

  useEffect(() => {
    if (correctingPopRef.current) return;
    const index = historyIndex(window.history.state);
    if (index !== null) acceptedIndexRef.current = index;
  }, [location.hash, location.key, location.pathname, location.search]);

  useLayoutEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const guardAnchor = (event: MouseEvent) => {
      if (
        !dirtyRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) {
        return;
      }
      const anchorTarget = (anchor.target || "_self").toLowerCase();
      if (anchorTarget !== "_self") return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href === window.location.href) return;
      if (confirmDeparture()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    const guardPop = (event: PopStateEvent) => {
      const targetIndex = historyIndex(event.state);
      if (correctingPopRef.current) {
        correctingPopRef.current = false;
        if (targetIndex !== null) acceptedIndexRef.current = targetIndex;
        return;
      }

      if (!dirtyRef.current || confirmDeparture()) {
        if (targetIndex !== null) acceptedIndexRef.current = targetIndex;
        return;
      }

      event.stopImmediatePropagation();
      event.stopPropagation();
      const acceptedIndex = acceptedIndexRef.current;
      if (acceptedIndex === null || targetIndex === null) {
        correctingPopRef.current = true;
        window.history.forward();
        return;
      }

      const correction = acceptedIndex - targetIndex;
      if (correction !== 0) {
        correctingPopRef.current = true;
        window.history.go(correction);
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardAnchor, true);
    window.addEventListener("popstate", guardPop, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardAnchor, true);
      window.removeEventListener("popstate", guardPop, true);
    };
  }, [confirmDeparture]);

  const value = useMemo<EditorDirtyNavigationValue>(
    () => ({
      confirmDeparture,
      isDirty,
      navigateSafely,
      removeDirtySource,
      setDirtySource,
    }),
    [
      confirmDeparture,
      isDirty,
      navigateSafely,
      removeDirtySource,
      setDirtySource,
    ],
  );

  return (
    <EditorDirtyNavigationContext.Provider value={value}>
      {children}
    </EditorDirtyNavigationContext.Provider>
  );
}
