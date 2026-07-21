import { useContext, useLayoutEffect, useRef } from "react";

import {
  EditorDirtyNavigationContext,
  type DirtySource,
} from "@/components/editor/EditorDirtyNavigationContext";

export function useEditorDirtyState(dirty: boolean) {
  const context = useContext(EditorDirtyNavigationContext);
  const sourceRef = useRef<DirtySource>();
  const removeDirtySource = context?.removeDirtySource;
  const setDirtySource = context?.setDirtySource;
  if (!sourceRef.current) sourceRef.current = Symbol("editor-dirty-source");

  useLayoutEffect(() => {
    if (!removeDirtySource || !setDirtySource) return;
    const source = sourceRef.current!;
    setDirtySource(source, dirty);
    return () => removeDirtySource(source);
  }, [dirty, removeDirtySource, setDirtySource]);
}

export function useEditorDirtyNavigation() {
  const context = useContext(EditorDirtyNavigationContext);
  if (!context) {
    throw new Error(
      "useEditorDirtyNavigation must be used within EditorDirtyNavigationProvider",
    );
  }
  return context;
}
