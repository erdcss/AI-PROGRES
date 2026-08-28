import {
  AppTabPanelContext,
  useAppTabPanel,
  useScraperWorkspace,
  type AppTabMeta,
  type AppTabPanelContextValue,
} from "@/components/app-tabs-store";

export {
  AppTabPanelContext,
  useAppTabPanel,
  useScraperWorkspace,
  type AppTabMeta,
  type AppTabPanelContextValue,
};

/** @deprecated AppTabPanelContext kullanın */
export const ScraperWorkspaceContext = AppTabPanelContext;

export type ScraperWorkspaceTabMeta = AppTabMeta;
export type ScraperWorkspaceContextValue = AppTabPanelContextValue;
