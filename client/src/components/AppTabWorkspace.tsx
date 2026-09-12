import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Router, useLocation } from "wouter";
import {
  AppTabPanelContext,
  AppTabsStoreProvider,
  makeInitialTab,
  makeTabLocationHook,
  useAppTabsStore,
  type AppTabRecord,
} from "@/components/app-tabs-store";
import { AppRoutes } from "@/components/AppRoutes";
import { defaultTitleForPath } from "@/lib/app-tab-paths";
import { MobileNavigation } from "@/components/MobileNavigation";
import type { AccountUser } from "@/lib/account-auth";

const MAX_TABS = 6;
const DEFAULT_DOCUMENT_TITLE = "Turmarkt - Ürün Çekme Uygulaması";

function labelFor(tab: AppTabRecord, index: number): string {
  const raw = tab.title.trim();
  if (!raw || raw === "Yeni sekme") return `Sekme ${index + 1}`;
  return raw.length > 26 ? `${raw.slice(0, 24)}…` : raw;
}

function AppTabBar({ actions }: { actions?: ReactNode }) {
  const { tabs, activeId, busyCount, selectTab, addTab, closeTab } = useAppTabsStore();

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1.5 scrollbar-thin">
          {tabs.map((tab, index) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`group flex min-w-0 max-w-[220px] shrink-0 items-center rounded-md border px-1.5 py-1 ${
                  active
                    ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                    : "border-transparent bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-0.5 text-left text-xs font-medium"
                  onClick={() => selectTab(tab.id)}
                  title={tab.title}
                  data-testid={`app-tab-${index}`}
                >
                  {tab.busy ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  )}
                  <span className="truncate">{labelFor(tab, index)}</span>
                </button>
                {tabs.length > 1 ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-zinc-500 opacity-70 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label="Sekmeyi kapat"
                    data-testid={`app-tab-close-${index}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addTab}
            disabled={tabs.length >= MAX_TABS}
            className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              tabs.length >= MAX_TABS
                ? `En fazla ${MAX_TABS} sekme`
                : "Yeni sekme — Ana Sayfa açılır"
            }
            data-testid="app-tab-add"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {busyCount > 0 && tabs.some((t) => t.id !== activeId && t.busy) ? (
        <p className="px-3 pb-1.5 text-[11px] text-amber-400/90">
          {busyCount} işlem arka planda devam ediyor — sekmeler arasında geçiş güvenli.
        </p>
      ) : null}
    </div>
  );
}

const KeepAliveAppTab = memo(function KeepAliveAppTab({
  tab,
  isActive,
  isPrimaryTab,
  user,
}: {
  tab: AppTabRecord;
  isActive: boolean;
  isPrimaryTab: boolean;
  user: AccountUser;
}) {
  const { reportTabMeta } = useAppTabsStore();
  const locationHook = useMemo(() => makeTabLocationHook(tab.id), [tab.id]);

  const reportMeta = useCallback(
    (meta: { title: string; busy: boolean }) => {
      reportTabMeta(tab.id, meta);
    },
    [reportTabMeta, tab.id],
  );

  const panelValue = useMemo(
    () => ({
      tabId: tab.id,
      isActive,
      isPrimaryTab,
      reportMeta,
    }),
    [tab.id, isActive, isPrimaryTab, reportMeta],
  );

  return (
    <AppTabPanelContext.Provider value={panelValue}>
      <div className={isActive ? "block" : "hidden"} aria-hidden={!isActive}>
        <Router hook={locationHook}>
          <AppRoutes user={user} />
        </Router>
      </div>
    </AppTabPanelContext.Provider>
  );
});

function AppTabPanels({ user }: { user: AccountUser }) {
  const { tabs, activeId } = useAppTabsStore();
  return (
    <>
      {tabs.map((tab, index) => (
        <KeepAliveAppTab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeId}
          isPrimaryTab={index === 0}
          user={user}
        />
      ))}
    </>
  );
}

function GlobalLocationSync({
  activeId,
  setTabs,
}: {
  activeId: string;
  setTabs: React.Dispatch<React.SetStateAction<AppTabRecord[]>>;
}) {
  const [globalPath] = useLocation();

  useEffect(() => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeId) return tab;
        if (tab.path === globalPath) return tab;
        return {
          ...tab,
          path: globalPath,
          title: tab.customTitle ? tab.title : defaultTitleForPath(globalPath),
        };
      }),
    );
  }, [globalPath, activeId, setTabs]);

  return null;
}

function DocumentTitleSync() {
  const { busyCount } = useAppTabsStore();

  useEffect(() => {
    if (busyCount > 0) {
      document.title =
        busyCount === 1
          ? "İşlem devam ediyor… · Turmarkt"
          : `(${busyCount} sekme) İşlem devam ediyor · Turmarkt`;
    } else {
      document.title = DEFAULT_DOCUMENT_TITLE;
    }
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [busyCount]);

  return null;
}

export default function AppTabWorkspace({ user, actions }: { user: AccountUser; actions?: ReactNode }) {
  const [tabs, setTabs] = useState<AppTabRecord[]>(() => [makeInitialTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id ?? "");

  const currentActiveId = activeId || tabs[0]?.id || "";

  return (
    <AppTabsStoreProvider
      tabs={tabs}
      setTabs={setTabs}
      activeId={currentActiveId}
      setActiveId={setActiveId}
    >
      <GlobalLocationSync activeId={currentActiveId} setTabs={setTabs} />
      <DocumentTitleSync />
      <AppTabBar actions={actions} />
      {user.systemRole === "admin" ? <MobileNavigation /> : null}
      <AppTabPanels user={user} />
    </AppTabsStoreProvider>
  );
}
