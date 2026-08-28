import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation } from "wouter";
import { APP_TAB_HOME_PATH, defaultTitleForPath } from "@/lib/app-tab-paths";

export type AppTabRecord = {
  id: string;
  path: string;
  title: string;
  busy: boolean;
  customTitle: boolean;
};

export type AppTabMeta = {
  title: string;
  busy: boolean;
};

export type AppTabPanelContextValue = {
  tabId: string;
  isActive: boolean;
  isPrimaryTab: boolean;
  reportMeta: (meta: AppTabMeta) => void;
};

export const AppTabPanelContext = createContext<AppTabPanelContextValue | null>(null);

export function useAppTabPanel(): AppTabPanelContextValue | null {
  return useContext(AppTabPanelContext);
}

/** Scraper sayfası geriye dönük uyumluluk */
export const useScraperWorkspace = useAppTabPanel;

type TabPathSetter = (tabId: string, path: string, replace?: boolean) => void;

type AppTabsStoreValue = {
  tabs: AppTabRecord[];
  activeId: string;
  activeTab: AppTabRecord | undefined;
  busyCount: number;
  selectTab: (tabId: string) => void;
  addTab: () => void;
  closeTab: (tabId: string) => void;
  reportTabMeta: (tabId: string, meta: AppTabMeta) => void;
  navigateActiveTab: (path: string, replace?: boolean) => void;
  setTabPath: TabPathSetter;
  getPathForTab: (tabId: string) => string;
};

const AppTabsStoreContext = createContext<AppTabsStoreValue | null>(null);

export function useAppTabsStore(): AppTabsStoreValue {
  const ctx = useContext(AppTabsStoreContext);
  if (!ctx) throw new Error("useAppTabsStore must be used within AppTabsStoreProvider");
  return ctx;
}

export function useAppTabNavigation(): [string, (path: string, replace?: boolean) => void] {
  const store = useAppTabsStore();
  return [store.activeTab?.path ?? APP_TAB_HOME_PATH, store.navigateActiveTab];
}

export function useTabLocation(tabId: string): [string, (path: string, replace?: boolean) => void] {
  const store = useAppTabsStore();
  const path = store.tabs.find((t) => t.id === tabId)?.path ?? APP_TAB_HOME_PATH;
  const setLocation = useCallback(
    (to: string, replace?: boolean) => {
      store.setTabPath(tabId, to, replace);
    },
    [store, tabId],
  );
  return [path, setLocation];
}

function newTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function initialPath(): string {
  if (typeof window === "undefined") return APP_TAB_HOME_PATH;
  const path = `${window.location.pathname}${window.location.search}`;
  return path || APP_TAB_HOME_PATH;
}

export function makeInitialTab(): AppTabRecord {
  const path = initialPath();
  return {
    id: newTabId(),
    path,
    title: defaultTitleForPath(path),
    busy: false,
    customTitle: false,
  };
}

export function AppTabsStoreProvider({
  tabs,
  setTabs,
  activeId,
  setActiveId,
  children,
}: {
  tabs: AppTabRecord[];
  setTabs: Dispatch<SetStateAction<AppTabRecord[]>>;
  activeId: string;
  setActiveId: Dispatch<SetStateAction<string>>;
  children: ReactNode;
}) {
  const [, setGlobalLocation] = useLocation();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const busyCount = tabs.filter((t) => t.busy).length;

  const setTabPath = useCallback<TabPathSetter>(
    (tabId, path, replace) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            path,
            title: tab.customTitle ? tab.title : defaultTitleForPath(path),
          };
        }),
      );
      if (tabId === activeIdRef.current) {
        setGlobalLocation(path, { replace });
      }
    },
    [setGlobalLocation, setTabs],
  );

  const getPathForTab = useCallback(
    (tabId: string) => tabsRef.current.find((t) => t.id === tabId)?.path ?? APP_TAB_HOME_PATH,
    [],
  );

  const navigateActiveTab = useCallback(
    (path: string, replace?: boolean) => {
      const id = activeIdRef.current;
      if (id) setTabPath(id, path, replace);
    },
    [setTabPath],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      setActiveId(tabId);
      setGlobalLocation(tab.path);
    },
    [setActiveId, setGlobalLocation],
  );

  const addTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= 6) return prev;
      const next: AppTabRecord = {
        id: newTabId(),
        path: APP_TAB_HOME_PATH,
        title: "Ana Sayfa",
        busy: false,
        customTitle: false,
      };
      setActiveId(next.id);
      setGlobalLocation(APP_TAB_HOME_PATH);
      return [...prev, next];
    });
  }, [setGlobalLocation, setActiveId, setTabs]);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        setActiveId((current) => {
          if (current !== tabId) return current;
          const fallback = next[Math.max(0, idx - 1)] ?? next[0];
          if (fallback) setGlobalLocation(fallback.path);
          return fallback?.id ?? current;
        });
        return next;
      });
    },
    [setActiveId, setGlobalLocation, setTabs],
  );

  const reportTabMeta = useCallback(
    (tabId: string, meta: AppTabMeta) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          const nextTitle = meta.title?.trim() || tab.title;
          if (tab.title === nextTitle && tab.busy === meta.busy) return tab;
          return {
            ...tab,
            title: nextTitle,
            busy: meta.busy,
            customTitle: Boolean(meta.title?.trim()),
          };
        }),
      );
    },
    [setTabs],
  );

  const value = useMemo<AppTabsStoreValue>(
    () => ({
      tabs,
      activeId,
      activeTab,
      busyCount,
      selectTab,
      addTab,
      closeTab,
      reportTabMeta,
      navigateActiveTab,
      setTabPath,
      getPathForTab,
    }),
    [
      tabs,
      activeId,
      activeTab,
      busyCount,
      selectTab,
      addTab,
      closeTab,
      reportTabMeta,
      navigateActiveTab,
      setTabPath,
      getPathForTab,
    ],
  );

  return <AppTabsStoreContext.Provider value={value}>{children}</AppTabsStoreContext.Provider>;
}

/** wouter Router hook — sekme bazlı izole rota */
export function makeTabLocationHook(tabId: string) {
  return function useTabRouterLocation(): [string, (path: string, replace?: boolean) => void] {
    return useTabLocation(tabId);
  };
}
