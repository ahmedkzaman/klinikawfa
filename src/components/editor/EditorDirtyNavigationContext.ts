import { createContext } from "react";
import type { NavigateOptions, To } from "react-router-dom";

export type DirtySource = symbol;

export interface EditorDirtyNavigationValue {
  confirmDeparture: () => boolean;
  isDirty: boolean;
  navigateSafely: (to: To, options?: NavigateOptions) => boolean;
  removeDirtySource: (source: DirtySource) => void;
  setDirtySource: (source: DirtySource, dirty: boolean) => void;
}

export const EditorDirtyNavigationContext =
  createContext<EditorDirtyNavigationValue | null>(null);
