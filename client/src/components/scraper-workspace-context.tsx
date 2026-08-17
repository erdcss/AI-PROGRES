import { createContext, useContext } from "react";

export type ScraperWorkspaceTabMeta = {
  title: string;
  busy: boolean;
};

export type ScraperWorkspaceContextValue = {
  tabId: string;
  isActive: boolean;
  reportMeta: (meta: ScraperWorkspaceTabMeta) => void;
};

export const ScraperWorkspaceContext = createContext<ScraperWorkspaceContextValue | null>(
  null,
);

export function useScraperWorkspace(): ScraperWorkspaceContextValue | null {
  return useContext(ScraperWorkspaceContext);
}
