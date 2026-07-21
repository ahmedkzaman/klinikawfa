import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useLocation,
  useNavigate,
  type NavigateOptions,
  type To,
} from "react-router-dom";

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

type NavigationApi = {
  currentEntry?: { key?: unknown } | null;
  traverseTo?: (key: string) => { finished?: PromiseLike<unknown> } | undefined;
};

function browserNavigation() {
  const navigation = (window as unknown as { navigation?: NavigationApi })
    .navigation;
  return navigation && typeof navigation === "object" ? navigation : null;
}

function navigationEntryKey() {
  const key = browserNavigation()?.currentEntry?.key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
  const acceptedNavigationKeyRef = useRef<string | null>(navigationEntryKey());
  const acceptedRouteRef = useRef(currentRoute());
  const expectedCorrectionIndexRef = useRef<number | null>(null);
  const expectedCorrectionKeyRef = useRef<string | null>(null);
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
    if (
      expectedCorrectionIndexRef.current !== null ||
      expectedCorrectionKeyRef.current !== null
    ) {
      return;
    }
    acceptedIndexRef.current = historyIndex(window.history.state);
    acceptedNavigationKeyRef.current = navigationEntryKey();
    acceptedRouteRef.current = currentRoute();
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
      const targetNavigationKey = navigationEntryKey();
      const expectedCorrectionIndex = expectedCorrectionIndexRef.current;
      const expectedCorrectionKey = expectedCorrectionKeyRef.current;
      const correctionPending =
        expectedCorrectionIndex !== null || expectedCorrectionKey !== null;
      const correctionIndexMatches =
        expectedCorrectionIndex === null
          ? targetIndex === null
          : targetIndex === expectedCorrectionIndex;
      const correctionKeyMatches =
        expectedCorrectionKey === null ||
        targetNavigationKey === expectedCorrectionKey;

      const clearExpectedCorrection = () => {
        expectedCorrectionIndexRef.current = null;
        expectedCorrectionKeyRef.current = null;
      };

      const acceptCurrentEntry = () => {
        clearExpectedCorrection();
        acceptedIndexRef.current = targetIndex;
        acceptedNavigationKeyRef.current = targetNavigationKey;
        acceptedRouteRef.current = currentRoute();
      };

      const failClosedToAcceptedRoute = () => {
        clearExpectedCorrection();
        navigate(acceptedRouteRef.current, { replace: true });
      };

      const traverseToAcceptedKey = (key: string) => {
        const navigation = browserNavigation();
        if (typeof navigation?.traverseTo !== "function") return false;
        try {
          const result = navigation.traverseTo(key);
          if (result?.finished) {
            void Promise.resolve(result.finished).catch(
              failClosedToAcceptedRoute,
            );
          }
          return true;
        } catch {
          return false;
        }
      };

      if (
        correctionPending &&
        correctionIndexMatches &&
        correctionKeyMatches
      ) {
        acceptCurrentEntry();
        return;
      }

      if (!dirtyRef.current || confirmDeparture()) {
        acceptCurrentEntry();
        return;
      }

      event.stopImmediatePropagation();
      event.stopPropagation();
      const acceptedIndex = acceptedIndexRef.current;
      const acceptedNavigationKey = acceptedNavigationKeyRef.current;
      expectedCorrectionIndexRef.current = acceptedIndex;
      expectedCorrectionKeyRef.current = acceptedNavigationKey;

      if (acceptedIndex === null || targetIndex === null) {
        if (
          acceptedNavigationKey !== null &&
          traverseToAcceptedKey(acceptedNavigationKey)
        ) {
          return;
        }
        failClosedToAcceptedRoute();
        return;
      }

      const correction = acceptedIndex - targetIndex;
      if (correction !== 0) {
        window.history.go(correction);
        return;
      }

      if (
        acceptedNavigationKey !== null &&
        targetNavigationKey !== acceptedNavigationKey &&
        traverseToAcceptedKey(acceptedNavigationKey)
      ) {
        return;
      }

      failClosedToAcceptedRoute();
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardAnchor, true);
    window.addEventListener("popstate", guardPop, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardAnchor, true);
      window.removeEventListener("popstate", guardPop, true);
    };
  }, [confirmDeparture, navigate]);

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
